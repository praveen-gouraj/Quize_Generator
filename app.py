import json
import os
import random
import re
import sqlite3
import uuid
from collections import Counter
from datetime import datetime
from io import BytesIO

from flask import Flask, flash, redirect, render_template, request, session, url_for, send_file, jsonify
from PyPDF2 import PdfReader

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
except ImportError:
    pass

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional dependency during setup
    OpenAI = None


BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "database.db")
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
ALLOWED_EXTENSIONS = {"pdf", "txt", "text"}

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def get_db_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    connection = get_db_connection()
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            theme TEXT DEFAULT 'dark'
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS quiz_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            quiz_data TEXT NOT NULL,
            score INTEGER,
            total_questions INTEGER,
            percentage INTEGER,
            difficulty TEXT,
            weak_topics TEXT,
            time_taken INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            share_token TEXT UNIQUE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            total_quizzes INTEGER DEFAULT 0,
            avg_accuracy REAL DEFAULT 0,
            streak INTEGER DEFAULT 0,
            xp_points INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """
    )
    connection.commit()
    connection.close()


init_db()


def generate_share_token():
    return str(uuid.uuid4())[:12]


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text(uploaded_file):
    filename = uploaded_file.filename or ""
    if not allowed_file(filename):
        raise ValueError("Only PDF and text files are allowed.")

    extension = filename.rsplit(".", 1)[1].lower()
    uploaded_file.stream.seek(0)

    if extension == "pdf":
        reader = PdfReader(uploaded_file.stream)
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:
                raise ValueError("Encrypted PDFs are not supported.") from exc

        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        text = "\n".join(pages)
    else:
        raw_bytes = uploaded_file.stream.read()
        text = raw_bytes.decode("utf-8", errors="ignore")

    cleaned_text = re.sub(r"\s+", " ", text).strip()
    if not cleaned_text:
        raise ValueError("Could not extract text from the uploaded file.")
    return cleaned_text


def normalize_score(raw_score, total_questions):
    if total_questions <= 0:
        return 0
    return int(round((raw_score / total_questions) * 100))


def get_difficulty(score_percentage=None):
    if score_percentage is None:
        connection = get_db_connection()
        latest = connection.execute(
            "SELECT score FROM scores ORDER BY id DESC LIMIT 1"
        ).fetchone()
        connection.close()
        if latest is None:
            return "medium"
        score_percentage = latest["score"]

    if score_percentage < 50:
        return "easy"
    if score_percentage <= 80:
        return "medium"
    return "hard"


def shorten_text(text, limit=6500):
    return text[:limit]


def parse_json_array(raw_response):
    content = raw_response.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?", "", content, flags=re.IGNORECASE).strip()
        content = re.sub(r"```$", "", content).strip()

    start_index = content.find("[")
    end_index = content.rfind("]")
    if start_index != -1 and end_index != -1:
        content = content[start_index : end_index + 1]

    parsed = json.loads(content)
    if isinstance(parsed, dict) and "questions" in parsed:
        parsed = parsed["questions"]
    if not isinstance(parsed, list):
        raise ValueError("OpenAI response was not a JSON array.")
    return parsed


def normalize_answer(answer_value, options):
    text = str(answer_value).strip()
    if not text:
        return "A"

    upper_value = text.upper()
    if upper_value in {"A", "B", "C", "D"}:
        return upper_value

    if text.isdigit():
        index = int(text) - 1
        if 0 <= index < min(len(options), 4):
            return chr(65 + index)

    for index, option in enumerate(options[:4]):
        if str(option).strip().lower() == text.lower():
            return chr(65 + index)

    match = re.search(r"\b([A-D])\b", upper_value)
    if match:
        return match.group(1)

    return "A"


def is_true_false_style(options):
    normalized = [str(option).strip().lower() for option in options[:4]]
    tf_values = {"true", "false", "t", "f", "yes", "no"}
    if not normalized:
        return False
    unique_values = set(normalized)
    return unique_values.issubset(tf_values)


def has_four_distinct_options(options):
    normalized = [str(option).strip().lower() for option in options[:4]]
    return len(normalized) == 4 and len(set(normalized)) == 4


def sanitize_quiz(raw_questions):
    questions = []
    for item in raw_questions:
        if not isinstance(item, dict):
            continue

        question_text = str(item.get("question", "")).strip()
        topic = str(item.get("topic", "General")).strip() or "General"
        raw_options = item.get("options", [])

        if isinstance(raw_options, dict):
            raw_options = list(raw_options.values())
        if isinstance(raw_options, str):
            raw_options = [raw_options]

        options = [str(option).strip() for option in raw_options if str(option).strip()]
        if len(options) < 4 or not question_text:
            continue

        options = options[:4]
        if not has_four_distinct_options(options):
            continue
        if is_true_false_style(options):
            continue

        answer = normalize_answer(item.get("answer", "A"), options)

        questions.append(
            {
                "question": question_text,
                "options": options,
                "answer": answer,
                "topic": topic,
                "qtype": "mcq",
            }
        )

    if not questions:
        raise ValueError("Could not build quiz questions.")

    return questions


def extract_keywords(text, limit=12):
    stop_words = {
        "about",
        "above",
        "after",
        "again",
        "against",
        "between",
        "because",
        "before",
        "being",
        "below",
        "could",
        "does",
        "doing",
        "during",
        "each",
        "from",
        "have",
        "into",
        "more",
        "most",
        "other",
        "same",
        "some",
        "such",
        "than",
        "that",
        "then",
        "there",
        "these",
        "this",
        "those",
        "through",
        "using",
        "what",
        "when",
        "where",
        "which",
        "while",
        "with",
        "your",
        "the",
        "and",
        "for",
        "are",
        "was",
        "were",
        "will",
        "you",
        "has",
        "had",
        "have",
        "not",
        "can",
        "all",
        "any",
        "but",
        "our",
        "its",
        "from",
        "com",
    }

    words = re.findall(r"[A-Za-z][A-Za-z0-9_\-]{4,}", text.lower())
    filtered = [word for word in words if word not in stop_words]
    ranked = Counter(filtered).most_common(limit)
    return [word.title() for word, _ in ranked]


def build_distractors(source_keywords, current_keyword):
    generic_pool = [
        "Concept",
        "Method",
        "Process",
        "System",
        "Theory",
        "Structure",
        "Function",
        "Model",
    ]
    candidates = [keyword for keyword in source_keywords if keyword.lower() != current_keyword.lower()]
    candidates.extend(generic_pool)
    random.shuffle(candidates)

    distractors = []
    for candidate in candidates:
        if candidate not in distractors and candidate.lower() != current_keyword.lower():
            distractors.append(candidate)
        if len(distractors) == 3:
            break

    while len(distractors) < 3:
        filler = generic_pool[len(distractors)]
        if filler.lower() != current_keyword.lower() and filler not in distractors:
            distractors.append(filler)

    return distractors[:3]


def generate_fallback_quiz(text, difficulty, num_questions=5):
    keywords = extract_keywords(text)
    if not keywords:
        keywords = ["Concept", "Topic", "Idea", "Term", "Detail"]

    templates = ["association", "definition", "application", "method"]

    questions = []
    for i in range(min(num_questions, 20)):
        keyword = keywords[i % len(keywords)]
        qtype = templates[i % len(templates)]

        if qtype == "association":
            distractors = build_distractors(keywords, keyword)
            options = [keyword] + distractors
            random.shuffle(options)
            correct_letter = chr(65 + options.index(keyword))
            qtext = f"Which term is most associated with {keyword.lower()}?"

        elif qtype == "definition":
            distractors = build_distractors(keywords, keyword)
            options = [f"The definition of {keyword}"] + distractors
            random.shuffle(options)
            try:
                correct_letter = chr(65 + options.index(next(o for o in options if keyword in o or keyword.lower() in o.lower())))
            except StopIteration:
                correct_letter = "A"
            qtext = f"What best defines {keyword}?"

        elif qtype == "application":
            distractors = build_distractors(keywords, keyword)
            options = [f"Use {keyword} to solve X"] + distractors
            random.shuffle(options)
            try:
                correct_letter = chr(65 + options.index(next(o for o in options if keyword.lower() in o.lower() or keyword in o)))
            except StopIteration:
                correct_letter = "A"
            qtext = f"Which option shows an application of {keyword}?"

        else:
            distractors = build_distractors(keywords, keyword)
            options = [keyword] + distractors
            random.shuffle(options)
            correct_letter = chr(65 + options.index(keyword)) if keyword in options else "A"
            qtext = f"Which term best represents the idea of {keyword.lower()}?"

        # Ensure we have exactly 4 options
        if len(options) < 4:
            options = (options + ["Option X", "Option Y", "Option Z"])[:4]

        questions.append(
            {
                "question": qtext,
                "options": options[:4],
                "answer": correct_letter,
                "topic": keyword,
                "qtype": "mcq",
            }
        )

    return questions


def generate_quiz(text, difficulty, num_questions=5):
    compressed_text = shorten_text(text)
    fallback_quiz = generate_fallback_quiz(compressed_text, difficulty, num_questions=num_questions)

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key or OpenAI is None:
        return fallback_quiz

    try:
        client = OpenAI(api_key=api_key)
        model_name = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        prompt = f"""
You are an expert quiz generator.
Create exactly {num_questions} multiple-choice questions from the provided study material.

Return ONLY valid JSON as an array with this structure:
[
    {{
        "question": "Short question text",
        "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
        "answer": "A",
        "topic": "Short topic name",
        "qtype": "mcq"
    }}
]

Rules:
- The answer must be one of A, B, C, or D.
- The correct answer must match the option at that position.
    - The 4 options must be distinct and plausible.
    - Do not create true/false questions.
- Keep each question and option concise.
    - All questions must be MCQ with four unique options.
- Do not include markdown fences or extra commentary.

Requested difficulty: {difficulty}
Requested number_of_questions: {num_questions}

Study material:
{compressed_text}
""".strip()

        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You output only valid JSON arrays for quiz questions."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
        )
        raw_content = response.choices[0].message.content or ""
        parsed = parse_json_array(raw_content)
        # Allow OpenAI to specify qtype; sanitize_quiz will normalize
        sanitized = sanitize_quiz(parsed)
        # If OpenAI returned fewer than requested, pad from fallback
        if len(sanitized) < num_questions:
            needed = num_questions - len(sanitized)
            sanitized.extend(fallback_quiz[:needed])
        return sanitized[:num_questions]
    except Exception:
        return fallback_quiz


def evaluate_answers(form_data, quiz):
    score = 0
    details = []
    weak_topic_counter = Counter()

    for index, question in enumerate(quiz):
        selected_letter = (form_data.get(f"question_{index}") or "").strip().upper()
        options = question.get("options", [])
        correct_letter = str(question.get("answer", "A")).strip().upper()

        selected_text = ""
        correct_text = ""

        if selected_letter in {"A", "B", "C", "D"}:
            selected_index = ord(selected_letter) - 65
            if 0 <= selected_index < len(options):
                selected_text = options[selected_index]

        if correct_letter in {"A", "B", "C", "D"}:
            correct_index = ord(correct_letter) - 65
            if 0 <= correct_index < len(options):
                correct_text = options[correct_index]

        is_correct = selected_letter == correct_letter
        if is_correct:
            score += 1
        else:
            weak_topic_counter[question.get("topic", "General")] += 1

        details.append(
            {
                "question": question.get("question", ""),
                "selected_letter": selected_letter or "-",
                "selected_text": selected_text or "Not answered",
                "correct_letter": correct_letter,
                "correct_text": correct_text or "Unknown",
                "topic": question.get("topic", "General"),
                "is_correct": is_correct,
            }
        )

    percentage = normalize_score(score, len(quiz))
    weak_topics = ", ".join(topic for topic, _ in weak_topic_counter.most_common(3))
    return score, percentage, details, weak_topics


def get_or_create_user(name):
    connection = get_db_connection()
    user = connection.execute("SELECT id FROM users WHERE name = ?", (name,)).fetchone()
    if user is None:
        try:
            cursor = connection.execute("INSERT INTO users (name) VALUES (?)", (name,))
            connection.commit()
            user_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            user = connection.execute("SELECT id FROM users WHERE name = ?", (name,)).fetchone()
            user_id = user["id"]
    else:
        user_id = user["id"]
    connection.close()
    return user_id


def store_score(score_percentage, difficulty, weak_topics, user_id=None):
    connection = get_db_connection()
    connection.execute(
        "INSERT INTO scores (score, difficulty, weak_topics) VALUES (?, ?, ?)",
        (score_percentage, difficulty, weak_topics),
    )
    connection.commit()
    connection.close()


def store_quiz_history(user_id, quiz_data, score, total_questions, percentage, difficulty, weak_topics, time_taken):
    connection = get_db_connection()
    share_token = generate_share_token()
    connection.execute(
        """INSERT INTO quiz_history (user_id, quiz_data, score, total_questions, percentage, difficulty, weak_topics, time_taken, share_token)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, json.dumps(quiz_data), score, total_questions, percentage, difficulty, weak_topics, time_taken, share_token),
    )
    connection.commit()
    last_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
    connection.close()
    return last_id, share_token


def update_analytics(user_id, score_percentage):
    connection = get_db_connection()
    analytics = connection.execute("SELECT * FROM analytics WHERE user_id = ?", (user_id,)).fetchone()
    if analytics:
        total = analytics[2] + 1
        avg = (analytics[3] * (total - 1) + score_percentage) / total
        xp = analytics[5] + (score_percentage // 10)
        connection.execute(
            "UPDATE analytics SET total_quizzes = ?, avg_accuracy = ?, xp_points = ? WHERE user_id = ?",
            (total, avg, xp, user_id),
        )
    else:
        connection.execute(
            "INSERT INTO analytics (user_id, total_quizzes, avg_accuracy, xp_points) VALUES (?, 1, ?, ?)",
            (user_id, score_percentage, score_percentage // 10),
        )
    connection.commit()
    connection.close()


def generate_pdf_quiz(student_name, quiz_data, score=None, percentage=None):
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors

    pdf_buffer = BytesIO()
    doc = SimpleDocTemplate(pdf_buffer, pagesize=letter, topMargin=0.75*inch, bottomMargin=0.75*inch)
    elements = []
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(name='CustomTitle', parent=styles['Heading1'], fontSize=24, textColor=colors.HexColor('#2f7eff'), spaceAfter=12)
    heading_style = ParagraphStyle(name='CustomHeading', parent=styles['Heading2'], fontSize=14, textColor=colors.HexColor('#2f7eff'), spaceAfter=10)
    normal_style = styles['Normal']

    elements.append(Paragraph(f"Quiz: {student_name}", title_style))
    if score is not None:
        elements.append(Paragraph(f"<b>Score: {score}/{len(quiz_data)} ({percentage}%)</b>", heading_style))
    elements.append(Spacer(1, 0.2*inch))

    for idx, q in enumerate(quiz_data, 1):
        elements.append(Paragraph(f"<b>Q{idx}. {q.get('question', '')}</b>", normal_style))
        for i, opt in enumerate(q.get('options', [])):
            elements.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;{chr(65+i)}) {opt}", normal_style))
        elements.append(Spacer(1, 0.1*inch))
        if idx % 5 == 0:
            elements.append(PageBreak())

    doc.build(elements)
    pdf_buffer.seek(0)
    return pdf_buffer


@app.route("/", methods=["GET", "POST"])
def index():
    recommended_difficulty = get_difficulty()

    if request.method == "POST":
        # For quiz generation, student_name is now optional (anonymous users can create quizzes)
        student_name = request.form.get("student_name", "").strip()
        uploaded_file = request.files.get("study_material")
        source_type = request.form.get("source_type", "file")
        raw_text = request.form.get("raw_text", "").strip()

        if uploaded_file is None or uploaded_file.filename == "":
            if not raw_text:
                flash("Please upload a file or paste study material.", "error")
                return redirect(url_for("index"))

        try:
            if source_type == "text" and raw_text:
                extracted_text = raw_text
            elif uploaded_file and uploaded_file.filename:
                extracted_text = extract_text(uploaded_file)
            else:
                raise ValueError("Please provide study material (file or text).")
            
            # Create user if name provided, otherwise use anonymous
            if student_name:
                user_id = get_or_create_user(student_name)
            else:
                user_id = None

            # read user-selected difficulty and number of questions
            difficulty = request.form.get("difficulty", recommended_difficulty)
            try:
                num_questions = int(request.form.get("num_questions", 5))
                if num_questions < 1:
                    num_questions = 5
                if num_questions > 50:
                    num_questions = 50
            except Exception:
                num_questions = 5

            quiz = generate_quiz(extracted_text, difficulty, num_questions=num_questions)

            if student_name:
                session["student_name"] = student_name
            if user_id:
                session["user_id"] = user_id
            session["quiz"] = quiz
            session["quiz_difficulty"] = difficulty
            session["num_questions"] = num_questions
            session["source_text"] = extracted_text[:500]

            return redirect(url_for("quiz_page"))
        except ValueError as exc:
            flash(str(exc), "error")
        except Exception:
            flash("Something went wrong while generating the quiz.", "error")

    # Render dashboard as the main homepage
    user_id = session.get("user_id")
    latest_score = session.get("last_score_percentage", 0)
    recent_quizzes = session.get("recent_quizzes")
    if not isinstance(recent_quizzes, (list, tuple)):
        recent_quizzes = []
    analytics_data = None
    if user_id:
        connection = get_db_connection()
        analytics_data = connection.execute(
            "SELECT total_quizzes, avg_accuracy, streak, xp_points FROM analytics WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        connection.close()
    return render_template(
        "dashboard.html",
        student_name=session.get("student_name", ""),
        latest_score=latest_score,
        recent_quizzes=recent_quizzes,
        difficulty=recommended_difficulty,
        theme=session.get("theme", "dark"),
        analytics=analytics_data,
    )


@app.route("/quiz")
def quiz_page():
    quiz = session.get("quiz")
    if not quiz:
        flash("Upload study material first.", "error")
        return redirect(url_for("index"))

    return render_template(
        "quiz.html",
        student_name=session.get("student_name", "Student"),
        quiz=quiz,
        difficulty=session.get("quiz_difficulty", "medium"),
    )


@app.route("/dashboard")
def dashboard():
    user_id = session.get("user_id")
    latest_score = session.get("last_score_percentage", 0)
    # recent_quizzes should be an iterable of quiz summaries for the dashboard.
    # Fall back to an empty list when not available.
    recent_quizzes = session.get("recent_quizzes")
    # Ensure recent_quizzes is an iterable (list/tuple). Some older sessions stored an int.
    if not isinstance(recent_quizzes, (list, tuple)):
        recent_quizzes = []
    analytics_data = None
    if user_id:
        connection = get_db_connection()
        analytics_data = connection.execute(
            "SELECT total_quizzes, avg_accuracy, streak, xp_points FROM analytics WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        connection.close()
    return render_template(
        "dashboard.html",
        student_name=session.get("student_name", "Student"),
        latest_score=latest_score,
        recent_quizzes=recent_quizzes,
        difficulty=session.get("quiz_difficulty", "medium"),
        theme=session.get("theme", "dark"),
        analytics=analytics_data,
    )


@app.route("/submit", methods=["POST"])
def submit_quiz():
    quiz = session.get("quiz")
    if not quiz:
        flash("Your quiz session expired. Please generate a new quiz.", "error")
        return redirect(url_for("index"))

    score_raw, score_percentage, details, weak_topics = evaluate_answers(request.form, quiz)
    difficulty = session.get("quiz_difficulty", "medium")
    next_difficulty = get_difficulty(score_percentage)
    time_taken = request.form.get("time_taken", 0)

    store_score(score_percentage, difficulty, weak_topics)
    user_id = session.get("user_id")
    if user_id:
        store_quiz_history(user_id, quiz, score_raw, len(quiz), score_percentage, difficulty, weak_topics, int(time_taken))
        update_analytics(user_id, score_percentage)

    session["last_score_percentage"] = score_percentage
    session["recommended_difficulty"] = next_difficulty
    session["quiz"] = quiz
    session["last_quiz_details"] = details

    return render_template(
        "result.html",
        student_name=session.get("student_name", "Student"),
        score=score_raw,
        total=len(quiz),
        percentage=score_percentage,
        difficulty=difficulty,
        next_difficulty=next_difficulty,
        weak_topics=weak_topics,
        details=details,
        time_taken=int(time_taken),
    )


@app.route("/history")
def history():
    user_id = session.get("user_id")
    if not user_id:
        flash("Please log in first.", "error")
        return redirect(url_for("index"))
    connection = get_db_connection()
    history = connection.execute(
        "SELECT * FROM quiz_history WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    connection.close()
    return render_template("history.html", student_name=session.get("student_name", "Student"), history=history)


@app.route("/analytics")
def analytics():
    user_id = session.get("user_id")
    if not user_id:
        flash("Please log in first.", "error")
        return redirect(url_for("index"))
    connection = get_db_connection()
    analytics_data = connection.execute(
        "SELECT * FROM analytics WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    history = connection.execute(
        "SELECT percentage, created_at FROM quiz_history WHERE user_id = ? ORDER BY created_at",
        (user_id,),
    ).fetchall()
    connection.close()
    return render_template(
        "analytics.html",
        student_name=session.get("student_name", "Student"),
        analytics=analytics_data,
        history=history,
    )


@app.route("/settings", methods=["GET", "POST"])
def settings():
    user_id = session.get("user_id")
    if not user_id:
        flash("Please log in first.", "error")
        return redirect(url_for("index"))
    if request.method == "POST":
        theme = request.form.get("theme", "dark")
        connection = get_db_connection()
        connection.execute("UPDATE users SET theme = ? WHERE id = ?", (theme, user_id))
        connection.commit()
        connection.close()
        session["theme"] = theme
        flash(f"Theme changed to {theme}.", "message")
        return redirect(url_for("settings"))
    connection = get_db_connection()
    user = connection.execute("SELECT theme FROM users WHERE id = ?", (user_id,)).fetchone()
    connection.close()
    theme = user["theme"] if user else "dark"
    return render_template("settings.html", student_name=session.get("student_name", "Student"), theme=theme)


@app.route("/download_pdf")
def download_pdf():
    quiz = session.get("quiz")
    details = session.get("last_quiz_details")
    if not quiz:
        flash("No quiz to download.", "error")
        return redirect(url_for("index"))
    student_name = session.get("student_name", "Quiz")
    score = None
    percentage = None
    if details:
        score = sum(1 for d in details if d["is_correct"])
        percentage = session.get("last_score_percentage", 0)
    pdf = generate_pdf_quiz(student_name, quiz, score, percentage)
    return send_file(pdf, mimetype="application/pdf", as_attachment=True, download_name=f"{student_name}_quiz.pdf")


@app.route("/share/<token>")
def view_shared_quiz(token):
    connection = get_db_connection()
    quiz_record = connection.execute(
        "SELECT user_id, quiz_data, score, total_questions, percentage, difficulty FROM quiz_history WHERE share_token = ?",
        (token,),
    ).fetchone()
    connection.close()
    if not quiz_record:
        flash("Quiz not found.", "error")
        return redirect(url_for("index"))
    user_name = "Student"
    connection = get_db_connection()
    user = connection.execute("SELECT name FROM users WHERE id = ?", (quiz_record["user_id"],)).fetchone()
    connection.close()
    if user:
        user_name = user["name"]
    return render_template(
        "shared_quiz.html",
        student_name=user_name,
        score=quiz_record["score"],
        total=quiz_record["total_questions"],
        percentage=quiz_record["percentage"],
        difficulty=quiz_record["difficulty"],
        token=token,
    )


@app.route("/api/copy-text/<text>")
def copy_text(text):
    return jsonify({"status": "success", "message": f"Copied: {text}"})


if __name__ == "__main__":
    app.run(debug=True)