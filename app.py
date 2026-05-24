import eventlet
eventlet.monkey_patch()
import pymysql
import secrets
import string
import random
import json
import re
import os
import bcrypt
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_mail import Mail, Message
from flask_socketio import SocketIO, emit, join_room, leave_room
import AI as ai 
import os
print("DB_HOST:", os.getenv('DB_HOST'))
print("DB_PORT:", os.getenv('DB_PORT'))
print("DB_NAME:", os.getenv('DB_NAME'))

app = Flask(__name__)
CORS(app)

app.config['SECRET_KEY']          = 'packandgo-secret-key-2024'
app.config['MAIL_SERVER']         = 'smtp.gmail.com'
app.config['MAIL_PORT']           = 587
app.config['MAIL_USE_TLS']        = True
app.config['MAIL_USERNAME']       = 'najoutasekrafi12@gmail.com'
app.config['MAIL_PASSWORD']       = 'aebn wzjy womo edjm'
app.config['MAIL_DEFAULT_SENDER'] = ('Pack & Go Support', 'najoutasekrafi12@gmail.com')

mail     = Mail(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

otp_storage = {}
chat_rooms  = {}
def get_db_connection():
    return pymysql.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=int(os.getenv('DB_PORT', 3306)),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'users_db'),
        cursorclass=pymysql.cursors.DictCursor
    )

def format_date(d):
    if hasattr(d, 'strftime'):
        return d.strftime("%Y-%m-%d")
    return str(d) if d else ""

def _is_code_expired(created_at):
    if created_at is None:
        return False
    try:
        if isinstance(created_at, datetime):
            dt = created_at
        elif hasattr(created_at, 'strftime'):
            dt = datetime(created_at.year, created_at.month, created_at.day)
        elif isinstance(created_at, str):
            created_at = created_at.strip()
            if 'T' in created_at:
                created_at = created_at.replace('T', ' ').split('.')[0]
            if len(created_at) == 10:
                dt = datetime.strptime(created_at, "%Y-%m-%d")
            else:
                dt = datetime.strptime(created_at[:19], "%Y-%m-%d %H:%M:%S")
        else:
            return False
        return datetime.now() - dt > timedelta(hours=24)
    except Exception as e:
        print(f"_is_code_expired parsing error ({type(created_at)}: {created_at}): {e}")
        return False


# ─────────────────────────────
# VALIDATIONS
# ─────────────────────────────
def validate_email(email: str) -> bool:
    pattern = r'^[^@]+@[^@]+\.[^@]+$'
    return bool(re.match(pattern, email))

def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < 6:
        return False, "Le mot de passe doit contenir 6 caractères ou plus"
    if not re.search(r'[A-Z]', password):
        return False, "Le mot de passe doit contenir au moins une lettre majuscule"
    if not re.search(r'[0-9]', password):
        return False, "Le mot de passe doit contenir au moins un chiffre"
    return True, ""

# ─────────────────────────────
# CHECK EMAIL
# ─────────────────────────────
@app.route("/check-email", methods=["POST"])
def check_email():
    data  = request.json or {}
    email = data.get("email", "").strip().lower()
    if not email:
        return jsonify({"exists": False, "message": "Email requis"}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        return jsonify({"exists": bool(user)}), 200
    except Exception as e:
        return jsonify({"exists": False, "message": str(e)}), 500

# ─────────────────────────────
# SIGNUP
# ─────────────────────────────
@app.route("/signup", methods=["POST"])
def signup():
    data      = request.json
    full_name = data.get("fullName", "").strip()
    email     = data.get("email", "").strip().lower()
    phone     = data.get("phone", "").strip()
    password  = data.get("password", "")

    if not full_name or not email or not password:
        return jsonify({"message": "Données manquantes"}), 401

    if not validate_email(email):
        return jsonify({"message": "Adresse e-mail invalide"}), 403

    pwd_valid, pwd_msg = validate_password(password)
    if not pwd_valid:
        return jsonify({"message": pwd_msg}), 402

    try:
        conn   = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({"message": "Un compte existe déjà avec cet e-mail. Veuillez vous connecter."}), 409

        hashed_pw = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        cursor.execute(
            "INSERT INTO users (full_name, email, phone, password) VALUES (%s, %s, %s, %s)",
            (full_name, email, phone, hashed_pw)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"message": "Inscription réussie !"}), 201

    except Exception as e:
        return jsonify({"message": f"Erreur serveur : {str(e)}"}), 500

# ─────────────────────────────
# LOGIN
# ─────────────────────────────
@app.route("/login", methods=["POST"])
def login():
    data     = request.json
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"message": "E-mail et mot de passe requis"}), 400

    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()

        if not user:
            return jsonify({"message": "Email ou mot de passe incorrect"}), 401

        stored_pw = user["password"]

        if stored_pw.startswith("SOCIAL_"):
            return jsonify({"message": "Ce compte utilise une connexion sociale (Google/Facebook). Veuillez vous connecter via le bouton correspondant."}), 401

        if not bcrypt.checkpw(password.encode("utf-8"), stored_pw.encode("utf-8")):
            return jsonify({"message": "Email ou mot de passe incorrect"}), 401

        return jsonify({
            "message": "Connexion réussie",
            "user": {
                "id":       user["id"],
                "fullName": user["full_name"],
                "email":    user["email"],
                "phone":    user.get("phone", ""),
            }
        }), 200

    except Exception as e:
        return jsonify({"message": f"Erreur serveur : {str(e)}"}), 500

# ─────────────────────────────
# RESET PASSWORD
# ─────────────────────────────
@app.route('/reset-password', methods=['POST'])
def reset_password():
    data  = request.json
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"error": "Email requis"}), 400

    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()

        if not user:
            return jsonify({"error": "Email non trouvé"}), 404

        otp = str(random.randint(100000, 999999))
        otp_storage[email] = otp

        msg = Message(
            subject="Code de vérification",
            sender=app.config['MAIL_DEFAULT_SENDER'],
            recipients=[email]
        )
        msg.body = (
            f"Bonjour,\n\n"
            f"Votre code de vérification est : {otp}\n\n"
            f"Ce code est valable 10 minutes.\n"
            f"Si vous n'avez pas demandé de réinitialisation, ignorez cet email."
        )
        mail.send(msg)

        return jsonify({"message": "Code envoyé avec succès"}), 200

    except Exception as e:
        return jsonify({"error": "Erreur serveur", "details": str(e)}), 500


@app.route('/verify-otp', methods=['POST'])
def verify_otp():
    data  = request.json
    email = (data.get("email") or "").strip().lower()
    otp   = (data.get("otp")   or "").strip()

    if not email or not otp:
        return jsonify({"error": "Email et code requis"}), 400

    stored_otp = otp_storage.get(email)

    if not stored_otp:
        return jsonify({"error": "Aucun code demandé pour cet email"}), 400

    if otp != stored_otp:
        return jsonify({"error": "Code incorrect ou expiré"}), 400

    return jsonify({"message": "Code vérifié avec succès"}), 200


@app.route('/update-password', methods=['POST'])
def update_password():
    data         = request.json
    email        = (data.get("email")        or "").strip().lower()
    otp          = (data.get("otp")          or "").strip()
    new_password = (data.get("new_password") or "").strip()

    if not email or not otp or not new_password:
        return jsonify({"error": "Tous les champs sont requis"}), 400

    is_valid, error_msg = validate_password(new_password)
    if not is_valid:
        return jsonify({"error": error_msg}), 400

    stored_otp = otp_storage.get(email)

    if not stored_otp:
        return jsonify({"error": "Session expirée, recommencez la procédure"}), 400

    if otp != stored_otp:
        return jsonify({"error": "Code OTP invalide"}), 400

    try:
        hashed_password = bcrypt.hashpw(
            new_password.encode('utf-8'),
            bcrypt.gensalt()
        ).decode('utf-8')

        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET password = %s WHERE email = %s",
            (hashed_password, email)
        )
        conn.commit()
        rows_affected = cursor.rowcount
        cursor.close()
        conn.close()

        if rows_affected == 0:
            return jsonify({"error": "Utilisateur non trouvé"}), 404

        otp_storage.pop(email, None)

        return jsonify({"message": "Mot de passe mis à jour avec succès"}), 200

    except Exception as e:
        return jsonify({"error": "Erreur serveur", "details": str(e)}), 500


# ─────────────────────────────
# INVITE CODE
# ─────────────────────────────
def generate_invite_code(length=8):
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(length))

# ─────────────────────────────
# SEND INVITATIONS
# ─────────────────────────────
@app.route('/send-invitations', methods=['POST'])
def send_invitations():
    data         = request.json
    invites      = data.get("invites", [])
    destination  = data.get("destination", "")
    date_depart  = data.get("date_depart", "")
    date_arrivee = data.get("date_arrivee", "")
    admin_id     = data.get("admin_id", "")

    if not invites:
        return jsonify({"error": "Aucun email fourni"}), 400

    nuitees = 0
    if date_depart and date_arrivee:
        try:
            d1      = datetime.strptime(date_depart,  "%Y-%m-%d")
            d2      = datetime.strptime(date_arrivee, "%Y-%m-%d")
            nb      = (d2 - d1).days
            nuitees = nb if nb > 0 else 0
        except Exception as e:
            print("Erreur calcul nuitées :", e)

    errors      = []
    sent        = []
    invite_code = None

    try:
        conn   = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT invite_code FROM invitations
            WHERE admin_id    = %s
              AND destination = %s
              AND date_depart  = %s
              AND date_arrivee = %s
            LIMIT 1
        """, (admin_id, destination, date_depart, date_arrivee))

        existing = cursor.fetchone()

        if existing:
            invite_code = existing["invite_code"]
        else:
            invite_code = generate_invite_code()

        for friend_email in invites:
            try:
                cursor.execute("""
                    INSERT INTO invitations
                        (admin_id, destination, date_depart, date_arrivee, nuitees, invite_code, email_invite, statut)
                    VALUES
                        (%s, %s, %s, %s, %s, %s, %s, 'en_attente')
                    ON DUPLICATE KEY UPDATE
                        statut  = 'en_attente',
                        nuitees = VALUES(nuitees)
                """, (admin_id, destination, date_depart, date_arrivee, nuitees, invite_code, friend_email))
                conn.commit()
            except Exception as e:
                errors.append({"email": friend_email, "error": f"BD: {str(e)}"})
                continue

            try:
                msg = Message(
                    subject="✈️ Invitation à un voyage Pack & Go !",
                    recipients=[friend_email]
                )
                msg.body = f"""
Bonjour 👋

Vous avez été invité(e) à rejoindre un voyage sur Pack & Go !

🗺️  Destination    : {destination}
📅  Date de départ : {date_depart}
📅  Date de retour : {date_arrivee}
🌙  Nombre de nuits : {nuitees} nuit(s)

🔑  Code d'invitation : {invite_code}
⚠️ Ce code va expirer après 24H

Téléchargez l'application, créez un compte et entrez ce code
pour rejoindre le voyage directement :
http://192.168.1.8:8081

À bientôt 🚀
Pack & Go Team
                """
                mail.send(msg)
                sent.append(friend_email)
            except Exception as e:
                errors.append({"email": friend_email, "error": f"Email: {str(e)}"})

        cursor.close()
        conn.close()

    except Exception as e:
        return jsonify({"error": f"Erreur base de données : {str(e)}"}), 500

    if len(sent) == len(invites):
        return jsonify({
            "message"    : f"{len(sent)} invitation(s) envoyée(s) avec succès",
            "invite_code": invite_code,
            "nuitees"    : nuitees,
            "sent"       : sent
        }), 200
    elif len(sent) > 0:
        return jsonify({
            "message"    : f"{len(sent)}/{len(invites)} invitation(s) envoyée(s)",
            "invite_code": invite_code,
            "nuitees"    : nuitees,
            "sent"       : sent,
            "errors"     : errors
        }), 207
    else:
        return jsonify({
            "error" : "Aucune invitation n'a pu être envoyée",
            "errors": errors
        }), 501

# ─────────────────────────────────────────────────────────────────────────────
# CHECK INVITE CODE
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/check-invite-code', methods=['POST'])
def check_invite_code():
    data = request.json
    code = data.get("code", "").strip().upper()

    if not code:
        return jsonify({"valid": False, "reason": "empty"}), 400

    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM invitations WHERE invite_code = %s LIMIT 1", (code,))
        invitation = cursor.fetchone()
        cursor.close(); conn.close()

        if not invitation:
            return jsonify({"valid": False, "reason": "not_found"}), 200

        expired = _is_code_expired(invitation.get("created_at"))
        if expired:
            return jsonify({"valid": False, "reason": "expired"}), 200

        return jsonify({
            "valid"           : True,
            "destination"     : invitation["destination"],
            "date_depart"     : format_date(invitation["date_depart"]),
            "date_arrivee"    : format_date(invitation["date_arrivee"]),
            "date_depart_raw" : str(invitation["date_depart"]),
            "date_arrivee_raw": str(invitation["date_arrivee"]),
            "nuitees"         : invitation["nuitees"],
        }), 200

    except Exception as e:
        return jsonify({"valid": False, "reason": "server_error", "error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# CHECK ALREADY JOINED
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/check-already-joined', methods=['POST'])
def check_already_joined():
    data    = request.json
    code    = data.get("code", "").strip().upper()
    user_id = data.get("user_id")
    email   = data.get("email", "").strip().lower()

    if not code or (not user_id and not email):
        return jsonify({"already_joined": False}), 200
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()

        if user_id:
            cursor.execute("""
                SELECT id FROM group_preferences
                WHERE invite_code = %s AND user_id = %s LIMIT 1
            """, (code, user_id))
            row = cursor.fetchone()
            if not row and email:
                cursor.execute("""
                    SELECT id FROM group_preferences
                    WHERE invite_code = %s AND LOWER(email) = %s LIMIT 1
                """, (code, email))
                row = cursor.fetchone()
        else:
            cursor.execute("""
                SELECT id FROM group_preferences
                WHERE invite_code = %s AND LOWER(email) = %s LIMIT 1
            """, (code, email))
            row = cursor.fetchone()

        cursor.close(); conn.close()
        return jsonify({"already_joined": bool(row)}), 200
    except Exception as e:
        return jsonify({"already_joined": False, "error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# JOIN WITH CODE
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/join-with-code', methods=['POST'])
def join_with_code():
    data    = request.json
    code    = data.get("code", "").strip().upper()
    email   = data.get("email", "").strip().lower()
    user_id = data.get("user_id")

    if not code or not email:
        return jsonify({"error": "Code et email requis"}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM invitations WHERE invite_code = %s LIMIT 1", (code,))
        invitation = cursor.fetchone()
        if not invitation:
            cursor.close(); conn.close()
            return jsonify({"error": "Code invalide ou expiré"}), 404
        if _is_code_expired(invitation.get("created_at")):
            cursor.close(); conn.close()
            return jsonify({"error": "Code expiré", "message": "Le délai de 24h est dépassé."}), 403

        already = None
        if user_id:
            cursor.execute("""
                SELECT id FROM group_preferences
                WHERE invite_code = %s AND user_id = %s LIMIT 1
            """, (code, user_id))
            already = cursor.fetchone()

        if not already:
            cursor.execute("""
                SELECT id FROM group_preferences
                WHERE invite_code = %s AND LOWER(email) = %s LIMIT 1
            """, (code, email))
            already = cursor.fetchone()

        if already:
            cursor.close(); conn.close()
            return jsonify({
                "error"  : "Déjà rejoint",
                "message": "Vous avez déjà soumis vos préférences pour ce voyage."
            }), 409

        cursor.execute("""
            UPDATE invitations SET statut = 'accepte'
            WHERE invite_code = %s AND LOWER(email_invite) = %s
        """, (code, email))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({
            "message"     : "Vous avez rejoint le voyage avec succès !",
            "destination" : invitation["destination"],
            "date_depart" : format_date(invitation["date_depart"]),
            "date_arrivee": format_date(invitation["date_arrivee"]),
            "nuitees"     : invitation["nuitees"],
            "admin_id"    : invitation["admin_id"]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# CHECK OVERLAP
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/check-overlap', methods=['POST'])
def check_overlap():
    data         = request.json
    email        = data.get("email", "").strip().lower()
    invite_code  = data.get("invite_code", "").strip().upper()
    date_depart  = data.get("date_depart", "")
    date_arrivee = data.get("date_arrivee", "")

    MIN_GAP_DAYS = 5

    if not email or not date_depart or not date_arrivee:
        return jsonify({"overlap": False, "blocked": False, "min_gap": MIN_GAP_DAYS, "conflicts": []}), 200

    try:
        new_start = datetime.strptime(str(date_depart)[:10],  "%Y-%m-%d").date()
        new_end   = datetime.strptime(str(date_arrivee)[:10], "%Y-%m-%d").date()
        if new_start > new_end:
            new_start, new_end = new_end, new_start
    except ValueError:
        return jsonify({"overlap": False, "blocked": False, "error": "Format de date invalide", "conflicts": []}), 400

    conn      = None
    cursor    = None
    conflicts = []

    try:
        conn   = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT gp.invite_code, i.destination, i.date_depart, i.date_arrivee
            FROM group_preferences gp
            JOIN invitations i ON i.invite_code = gp.invite_code
            WHERE LOWER(gp.email) = %s
              AND gp.invite_code != %s
        """, (email, invite_code))

        existing_trips = cursor.fetchall()

        for trip in existing_trips:
            try:
                ex_start = trip["date_depart"]
                ex_end   = trip["date_arrivee"]

                if not hasattr(ex_start, 'year'):
                    ex_start = datetime.strptime(str(ex_start)[:10], "%Y-%m-%d").date()
                if not hasattr(ex_end, 'year'):
                    ex_end = datetime.strptime(str(ex_end)[:10], "%Y-%m-%d").date()

                if ex_start > ex_end:
                    ex_start, ex_end = ex_end, ex_start

                if new_start <= ex_end and ex_start <= new_end:
                    gap = 0
                elif new_start > ex_end:
                    gap = (new_start - ex_end).days
                else:
                    gap = (ex_start - new_end).days

                if gap < MIN_GAP_DAYS:
                    conflicts.append({
                        "invite_code" : trip["invite_code"],
                        "destination" : trip["destination"],
                        "date_depart" : ex_start.isoformat(),
                        "date_arrivee": ex_end.isoformat(),
                        "gap_days"    : gap
                    })
            except Exception:
                continue

        blocked = len(conflicts) > 0
        return jsonify({
            "overlap"  : blocked,
            "blocked"  : blocked,
            "min_gap"  : MIN_GAP_DAYS,
            "conflicts": conflicts
        }), 200

    except Exception as e:
        return jsonify({
            "overlap": True, "blocked": True,
            "error": str(e), "conflicts": [], "min_gap": MIN_GAP_DAYS
        }), 500
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()

# ─────────────────────────────────────────────────────────────────────────────
# PENDING INVITES
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/pending-invites', methods=['GET'])
def get_pending_invites():
    code = request.args.get("invite_code", "").strip().upper()
    if not code:
        return jsonify({"error": "invite_code requis"}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT email_invite AS email, statut
            FROM invitations
            WHERE invite_code = %s AND statut = 'en_attente'
        """, (code,))
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        pending = [{"email": row["email"], "statut": row["statut"]} for row in rows]
        return jsonify({"pending": pending}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# DELETE GUEST
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/delete-guest', methods=['POST'])
def delete_guest():
    # Récupération sécurisée du JSON
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Requête invalide : JSON attendu'}), 400

    invite_code = (data.get('invite_code') or '').strip().upper()
    email = (data.get('email') or '').strip().lower()

    if not invite_code:
        return jsonify({'error': 'invite_code manquant'}), 400
    if not email:
        return jsonify({'error': 'email manquant'}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            "DELETE FROM group_preferences WHERE invite_code = %s AND LOWER(email) = %s",
            (invite_code, email)
        )
        deleted = cursor.rowcount

        if deleted == 0:
            conn.rollback()
            cursor.close()
            conn.close()
            return jsonify({'error': f"Aucun invité trouvé avec email={email!r}"}), 404

        cursor.execute(
            "UPDATE invitations SET statut = 'en_attente' WHERE invite_code = %s AND LOWER(email_invite) = %s",
            (invite_code, email)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'success': True}), 200

    except Exception as e:
        # En cas d'erreur, on retourne toujours du JSON
        return jsonify({'error': 'Erreur serveur', 'details': str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# UPDATE INVITE EMAIL
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/update-invite-email', methods=['POST'])
def update_invite_email():
    data      = request.json
    code      = data.get("invite_code", "").strip().upper()
    old_email = data.get("old_email", "").strip().lower()
    new_email = data.get("new_email", "").strip().lower()

    if not code or not old_email or not new_email:
        return jsonify({"error": "invite_code, old_email et new_email requis"}), 400
    if old_email == new_email:
        return jsonify({"message": "Aucun changement"}), 200

    try:
        conn   = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id FROM invitations
            WHERE invite_code = %s AND email_invite = %s AND statut = 'en_attente'
            LIMIT 1
        """, (code, old_email))
        row = cursor.fetchone()
        if not row:
            cursor.close(); conn.close()
            return jsonify({"error": "Invité introuvable ou a déjà répondu"}), 404

        cursor.execute("""
            SELECT id FROM invitations
            WHERE invite_code = %s AND email_invite = %s LIMIT 1
        """, (code, new_email))
        if cursor.fetchone():
            cursor.close(); conn.close()
            return jsonify({"error": "Ce nouvel email est déjà invité dans ce voyage"}), 409

        cursor.execute("""
            UPDATE invitations SET email_invite = %s
            WHERE invite_code = %s AND email_invite = %s
        """, (new_email, code, old_email))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"message": f"Email mis à jour : {old_email} → {new_email}", "new_email": new_email}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────
# NOTIFY LEADER
# ─────────────────────────────
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

@app.route('/notify-leader', methods=['POST'])
def notify_leader():
    data        = request.json
    code        = data.get("code", "").strip().upper()
    guest_email = data.get("guest_email", "").strip()
    action      = data.get("action", "rejoint")
    if not code or not guest_email:
        return jsonify({"error": "code et guest_email requis"}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT i.destination, i.date_depart, i.date_arrivee, i.nuitees,
                   u.email AS leader_email, u.full_name AS leader_name,
                   u.expo_push_token AS leader_expo_token
            FROM invitations i
            JOIN users u ON u.id = i.admin_id
            WHERE i.invite_code = %s LIMIT 1
        """, (code,))
        row = cursor.fetchone()
        cursor.close(); conn.close()
        if not row:
            return jsonify({"error": "Code invalide"}), 404
        leader_email      = row["leader_email"]
        leader_name       = row["leader_name"]
        leader_expo_token = row.get("leader_expo_token")
        destination       = row["destination"]
        date_depart       = format_date(row["date_depart"])
        date_arrivee      = format_date(row["date_arrivee"])
        nuitees           = row["nuitees"]
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    errors = []
    try:
        if action == "rejoint":
            subject      = f"✈️ Un invité a rejoint votre voyage vers {destination}"
            action_label = "✅ A rejoint le voyage"
        else:
            subject      = f"✏️ Un invité a modifié ses informations — {destination}"
            action_label = "✏️ A mis à jour ses informations"
        html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;border:1px solid #D6E4FF;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#042A66,#0A4DBF);padding:32px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;">✈️ Pack&amp;Go</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="color:#042A66;">Bonjour {leader_name} !</h2>
            <p style="color:#4B5563;font-size:15px;"><strong>{guest_email}</strong> a <strong>{action_label.lower()}</strong></p>
            <div style="background:#EEF4FF;border-radius:12px;padding:16px;margin:20px 0;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <tr><td style="color:#6B7280;">🗺️ Destination</td><td style="font-weight:700;text-align:right;">{destination}</td></tr>
                <tr><td style="color:#6B7280;">📅 Départ</td><td style="font-weight:700;text-align:right;">{date_depart}</td></tr>
                <tr><td style="color:#6B7280;">📅 Retour</td><td style="font-weight:700;text-align:right;">{date_arrivee}</td></tr>
                <tr><td style="color:#6B7280;">🌙 Durée</td><td style="font-weight:700;text-align:right;">{nuitees} nuit(s)</td></tr>
              </table>
            </div>
          </div>
        </div>"""
        msg      = Message(subject=subject, recipients=[leader_email])
        msg.html = html_body
        mail.send(msg)
    except Exception as e:
        errors.append(f"email: {str(e)}")

    try:
        import requests as req_lib
        if leader_expo_token and str(leader_expo_token).startswith("ExponentPushToken"):
            req_lib.post(EXPO_PUSH_URL, json={
                "to"   : leader_expo_token, "sound": "default",
                "title": "✏️ Mise à jour voyage" if action == "modifie" else "✈️ Nouveau membre",
                "body" : f"{guest_email} a {'modifié ses infos' if action == 'modifie' else 'rejoint le voyage'} pour {destination}",
                "data" : {"action": action, "destination": destination},
            }, headers={"Content-Type": "application/json"}, timeout=5)
    except Exception as e:
        errors.append(f"push: {str(e)}")

    if not errors:
        return jsonify({"status": "ok"}), 200
    elif len(errors) < 2:
        return jsonify({"status": "partial", "errors": errors}), 207
    return jsonify({"status": "error", "errors": errors}), 500

# ─────────────────────────────
# UPDATE INVITE INFO
# ─────────────────────────────
@app.route('/update-invite-info', methods=['POST'])
def update_invite_info():
    data         = request.json
    invite_code  = data.get("invite_code", "").strip().upper()
    destination  = data.get("destination", "").strip()
    date_depart  = data.get("date_depart", "").strip()
    date_arrivee = data.get("date_arrivee", "").strip()
    nuitees      = data.get("nuitees", 0)
    if not invite_code or not destination or not date_depart or not date_arrivee:
        return jsonify({"error": "Champs obligatoires manquants"}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM invitations WHERE invite_code = %s LIMIT 1", (invite_code,))
        invitation = cursor.fetchone()
        if not invitation:
            cursor.close(); conn.close()
            return jsonify({"error": "Code invalide ou expiré"}), 404
        cursor.execute("""
            UPDATE invitations SET destination=%s, date_depart=%s, date_arrivee=%s, nuitees=%s
            WHERE invite_code=%s
        """, (destination, date_depart, date_arrivee, nuitees, invite_code))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"message": "Informations mises à jour", "destination": destination,
                        "date_depart": date_depart, "date_arrivee": date_arrivee, "nuitees": nuitees}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# GROUP PREFERENCES
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/group-preferences', methods=['GET'])
def get_group_preferences():
    invite_code = request.args.get('invite_code', '').strip().upper()
    if not invite_code:
        return jsonify({"error": "invite_code requis"}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM group_preferences WHERE invite_code = %s",
            (invite_code,)
        )
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# UPDATE GROUP PREFERENCES
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/update-group-preferences', methods=['POST'])
def update_group_preferences():
    data         = request.json
    invite_code  = (data.get("invite_code") or "").strip().upper()
    guest_email  = (data.get("guest_email") or "").strip().lower()
    destination  = (data.get("destination") or "").strip()
    date_depart  = (data.get("date_depart") or "").strip()
    date_arrivee = (data.get("date_arrivee") or "").strip()
    nuitees      = data.get("nuitees", 0)

    if not invite_code or not guest_email:
        return jsonify({"error": "invite_code et guest_email requis"}), 400

    try:
        conn   = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id FROM group_preferences
            WHERE invite_code = %s AND LOWER(email) = %s
            LIMIT 1
        """, (invite_code, guest_email))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE group_preferences
                SET destination  = %s,
                    date_depart  = %s,
                    date_arrivee = %s,
                    nuitees      = %s
                WHERE invite_code = %s AND LOWER(email) = %s
            """, (destination, date_depart, date_arrivee,
                  nuitees, invite_code, guest_email))
            conn.commit()
            cursor.close(); conn.close()
            return jsonify({
                "status"      : "updated",
                "message"     : "Informations voyage mises à jour dans group_preferences",
                "invite_code" : invite_code,
                "guest_email" : guest_email,
                "destination" : destination,
                "date_depart" : date_depart,
                "date_arrivee": date_arrivee,
                "nuitees"     : nuitees,
            }), 200
        else:
            cursor.close(); conn.close()
            return jsonify({
                "status" : "not_found",
                "message": "Aucune préférence trouvée pour cet invité (pas encore soumises)",
            }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────
# SAVE TRIP
# ─────────────────────────────
@app.route('/api/save_trip', methods=['POST'])
def save_trip():
    data        = request.json
    user_id     = data.get('user_id', 1)
    destination = data.get('destination')
    arrival     = data.get('arrival')
    departure   = data.get('departure')
    if not destination or not arrival or not departure:
        return jsonify({"status": "error", "message": "Champs manquants"}), 400
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE users SET destination=%s, arrival_date=%s, departure_date=%s WHERE id=%s",
                (destination, arrival, departure, user_id)
            )
        connection.commit()
        return jsonify({"status": "succes", "message": "Voyage enregistré !"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        connection.close()

# ─────────────────────────────
# SAVE PREFERENCES
# ─────────────────────────────
@app.route('/api/save_preferences', methods=['POST'])
def save_preferences():
    data       = request.json
    user_id    = data.get('user_id')
    choices    = data.get('choices', {})
    hotel      = choices.get('hotelType', 'Non spécifié')
    location   = choices.get('hotelLocation', 'Non spécifié')
    activities = choices.get('activityTypes', [])
    cafe       = choices.get('cafeLevels', 'Non spécifié')
    voyage     = choices.get('voyageType', 'Non spécifié')
    budget     = choices.get('budget', 'NULL')
    acts_str      = ", ".join(activities) if isinstance(activities, list) else str(activities)
    prefs_summary = f"Hotel: {hotel}, Loc: {location}, Acts: {acts_str}, Cafe: {cafe}, Voyage: {voyage}"
    if not user_id:
        return jsonify({"error": "User ID is missing"}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET preferences=%s, budget=%s WHERE id=%s", (prefs_summary, budget, user_id))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"status": "succes"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────
# PAY
# ─────────────────────────────
@app.route('/pay', methods=['POST'])
def process_payment():
    data = request.json
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO payments (user_id, amount, card_name, card_number, expiry_date, cvv) VALUES (%s,%s,%s,%s,%s,%s)",
                (data.get('user_id'), data.get('amount'), data.get('card_name'),
                 data.get('card_number'), data.get('expiry_date'), data.get('cvv'))
            )
        connection.commit(); connection.close()
        return jsonify({"status": "success", "message": "Payment recorded!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ─────────────────────────────────────────────────────────────────────────────
# SAVE GROUP PREFERENCES
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/save_group_preferences', methods=['POST'])
def save_group_preferences():
    data = request.json
    invite_code = data.get("invite_code", "").strip().upper()
    user_id = data.get("user_id")
    email = data.get("email", "").strip().lower()
    role = data.get("role", "invite")

    if not invite_code:
        return jsonify({"error": "invite_code requis"}), 400
    if not user_id:
        return jsonify({"error": "user_id requis"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Récupérer l'email réel depuis users (sécurité)
        cursor.execute("SELECT email FROM users WHERE id = %s", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            cursor.close()
            conn.close()
            return jsonify({"error": "Utilisateur introuvable"}), 404
        email = user_row["email"]

        # 2. Vérifier l'existence d'un leader VALIDE (dont le compte existe)
        if role == 'leader':
            cursor.execute("""
                SELECT gp.user_id
                FROM group_preferences gp
                INNER JOIN users u ON u.id = gp.user_id
                WHERE gp.invite_code = %s AND gp.role = 'leader'
                LIMIT 1
            """, (invite_code,))
            existing_leader = cursor.fetchone()
            if existing_leader:
                if existing_leader['user_id'] != user_id:
                    cursor.close()
                    conn.close()
                    return jsonify({
                        "error": "Ce voyage a déjà un leader.",
                        "message": "Un autre utilisateur est déjà leader. Vous ne pouvez pas devenir leader."
                    }), 403
                # Même leader : on continue pour mise à jour

        # 3. Récupérer les informations du voyage (destination, dates)
        cursor.execute("""
            SELECT destination, date_depart, date_arrivee, nuitees
            FROM invitations WHERE invite_code = %s LIMIT 1
        """, (invite_code,))
        inv = cursor.fetchone()
        if not inv:
            cursor.close()
            conn.close()
            return jsonify({"error": "Invitation introuvable"}), 404

        inv_destination = inv["destination"]
        inv_date_depart = inv["date_depart"]
        inv_date_arrivee = inv["date_arrivee"]
        inv_nuitees = inv["nuitees"]

        # 4. Vérifier si l'utilisateur a déjà une ligne pour ce voyage
        cursor.execute("""
            SELECT id FROM group_preferences
            WHERE invite_code = %s AND user_id = %s LIMIT 1
        """, (invite_code, user_id))
        existing_row = cursor.fetchone()

        if existing_row:
            # Mise à jour de la ligne existante
            cursor.execute("""
                UPDATE group_preferences
                SET role = %s,
                    hotel_type = %s, hotel_location = %s, activity_types = %s,
                    cafe_levels = %s, voyage_type = %s, budget = %s,
                    hotel_name = %s, cafe_name = %s, tranche_age = %s,
                    destination = %s, date_depart = %s, date_arrivee = %s, nuitees = %s
                WHERE id = %s
            """, (role,
                  data.get("hotel_type", ""), data.get("hotel_location", ""),
                  data.get("activity_types", ""), data.get("cafe_levels", ""),
                  data.get("voyage_type", ""), data.get("budget"),
                  data.get("hotel_name", ""), data.get("cafe_name", ""),
                  data.get("tranche_age", ""),
                  inv_destination, inv_date_depart, inv_date_arrivee, inv_nuitees,
                  existing_row['id']))
        else:
            # Insertion d'une nouvelle ligne
            cursor.execute("""
                INSERT INTO group_preferences
                    (invite_code, user_id, email, role, hotel_type, hotel_location,
                     activity_types, cafe_levels, voyage_type, budget, hotel_name,
                     cafe_name, tranche_age, destination, date_depart, date_arrivee, nuitees)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (invite_code, user_id, email, role,
                  data.get("hotel_type", ""), data.get("hotel_location", ""),
                  data.get("activity_types", ""), data.get("cafe_levels", ""),
                  data.get("voyage_type", ""), data.get("budget"),
                  data.get("hotel_name", ""), data.get("cafe_name", ""),
                  data.get("tranche_age", ""),
                  inv_destination, inv_date_depart, inv_date_arrivee, inv_nuitees))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({
            "status": "success",
            "message": "Préférences sauvegardées",
            "email_used": email
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
# ─────────────────────────────
# GROUP SUMMARY LITE
# ─────────────────────────────
@app.route('/api/group-summary-lite', methods=['GET'])
def group_summary_lite():
    invite_code = request.args.get('invite_code', '').strip().upper()
    if not invite_code:
        return jsonify({"error": "invite_code requis"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Leader : uniquement si le compte utilisateur existe (INNER JOIN)
        cursor.execute("""
            SELECT gp.role, gp.email, gp.hotel_type, gp.hotel_location,
                   gp.activity_types, gp.cafe_levels, gp.voyage_type,
                   gp.budget, gp.hotel_name, gp.cafe_name, gp.tranche_age,
                   gp.destination, gp.date_depart, gp.date_arrivee, gp.nuitees,
                   u.full_name, u.phone
            FROM group_preferences gp
            INNER JOIN users u ON u.id = gp.user_id
            WHERE gp.invite_code = %s AND gp.role = 'leader'
            ORDER BY gp.created_at DESC
            LIMIT 1
        """, (invite_code,))
        leader = cursor.fetchone()

        # Invités : on prend tous ceux dont le compte existe (INNER JOIN)
        cursor.execute("""
            SELECT gp.role, gp.email, gp.hotel_type, gp.hotel_location,
                   gp.activity_types, gp.cafe_levels, gp.voyage_type,
                   gp.budget, gp.hotel_name, gp.cafe_name, gp.tranche_age,
                   gp.destination, gp.date_depart, gp.date_arrivee, gp.nuitees,
                   u.full_name, u.phone
            FROM group_preferences gp
            INNER JOIN users u ON u.id = gp.user_id
            WHERE gp.invite_code = %s AND gp.role = 'invite'
            ORDER BY gp.created_at ASC
        """, (invite_code,))
        guests = cursor.fetchall()

        cursor.close()
        conn.close()

        def fmt(m):
            return {
                "role": m['role'],
                "email": m['email'],
                "full_name": m['full_name'],
                "phone": m['phone'],
                "hotel_type": m['hotel_type'],
                "hotel_location": m['hotel_location'],
                "activity_types": m['activity_types'],
                "cafe_levels": m['cafe_levels'],
                "voyage_type": m['voyage_type'],
                "budget": str(m['budget']) if m['budget'] else None,
                "hotel_name": m['hotel_name'],
                "cafe_name": m['cafe_name'],
                "tranche_age": m['tranche_age'],
                "destination": m['destination'],
                "date_depart": format_date(m['date_depart']) if m['date_depart'] else None,
                "date_arrivee": format_date(m['date_arrivee']) if m['date_arrivee'] else None,
                "nuitees": m['nuitees'],
            }

        return jsonify({
            "invite_code": invite_code,
            "leader_prefs": fmt(leader) if leader else None,
            "guests_prefs": [fmt(g) for g in guests],
            "total_members": (1 if leader else 0) + len(guests)
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─────────────────────────────
# GROUP SUMMARY
# ─────────────────────────────
@app.route('/api/group-summary', methods=['GET'])
def group_summary():
    invite_code = request.args.get('invite_code', '').strip().upper()
    if not invite_code:
        return jsonify({"error": "invite_code requis"}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT i.destination, i.date_depart, i.date_arrivee, i.nuitees,
                   u.full_name AS leader_name, u.email AS leader_email
            FROM invitations i JOIN users u ON u.id = i.admin_id
            WHERE i.invite_code = %s LIMIT 1
        """, (invite_code,))
        voyage = cursor.fetchone()
        cursor.execute("""
            SELECT gp.role, gp.email, gp.hotel_type, gp.hotel_location,
                   gp.activity_types, gp.cafe_levels, gp.voyage_type,
                   gp.budget, gp.hotel_name, gp.cafe_name, gp.tranche_age,
                   gp.destination, gp.date_depart, gp.date_arrivee, gp.nuitees,
                   u.full_name, u.phone
            FROM group_preferences gp
            LEFT JOIN users u ON u.id = gp.user_id
            WHERE gp.invite_code = %s ORDER BY gp.role DESC, gp.created_at ASC
        """, (invite_code,))
        members = cursor.fetchall()
        cursor.close(); conn.close()
        if not voyage and not members:
            return jsonify({"error": "Code invalide"}), 404
        def fmt_member(m):
            return {
                "role"          : m['role'],
                "email"         : m['email'],
                "full_name"     : m['full_name'],
                "phone"         : m.get('phone'),
                "hotel_type"    : m['hotel_type'],
                "hotel_location": m['hotel_location'],
                "activity_types": m['activity_types'],
                "cafe_levels"   : m['cafe_levels'],
                "voyage_type"   : m['voyage_type'],
                "budget"        : str(m['budget']) if m['budget'] else None,
                "hotel_name"    : m['hotel_name'],
                "cafe_name"     : m['cafe_name'],
                "tranche_age"   : m['tranche_age'],
                "destination"   : m['destination'],
                "date_depart"   : format_date(m['date_depart'])  if m['date_depart']  else None,
                "date_arrivee"  : format_date(m['date_arrivee']) if m['date_arrivee'] else None,
                "nuitees"       : m['nuitees'],
            }
        voyage_info = None
        if voyage:
            voyage_info = {
                "destination" : voyage['destination'],
                "date_depart" : format_date(voyage['date_depart']),
                "date_arrivee": format_date(voyage['date_arrivee']),
                "nuitees"     : voyage['nuitees'],
                "leader_name" : voyage['leader_name'],
                "leader_email": voyage['leader_email']
            }
        leader_prefs = next((m for m in members if m['role'] == 'leader'), None)
        guest_prefs  = [m for m in members if m['role'] == 'invite']
        return jsonify({
            "invite_code"  : invite_code,
            "voyage"       : voyage_info,
            "leader_prefs" : fmt_member(leader_prefs) if leader_prefs else None,
            "guests_prefs" : [fmt_member(g) for g in guest_prefs],
            "total_members": len(members)
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ═══════════════════════════════════════════════════════════════════════════════
# SOCKET.IO — GROUPE CHAT
# ═══════════════════════════════════════════════════════════════════════════════
def make_message(text, sender, is_system=False):
    return {
        "id"       : secrets.token_hex(8),
        "text"     : text,
        "sender"   : sender,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "isSystem" : is_system
    }

@socketio.on('connect')
def on_connect():
    print(f"Client connecté : {request.sid}")

@socketio.on('disconnect')
def on_disconnect():
    print(f"Client déconnecté : {request.sid}")

@socketio.on('join_room')
def on_join_room(data):
    invite_code = (data.get("inviteCode") or "").strip().upper()
    username    = (data.get("username")   or "Inconnu").strip()
    if not invite_code:
        emit("error", {"message": "inviteCode requis"})
        return
    join_room(invite_code)
    if invite_code not in chat_rooms:
        chat_rooms[invite_code] = []
    emit("history", chat_rooms[invite_code])
    sys_msg = make_message(f"{username} a rejoint le groupe ✈️", "Système", is_system=True)
    chat_rooms[invite_code].append(sys_msg)
    # skip_sid évite le doublon pour le client qui vient de rejoindre
    emit("system_message", sys_msg, to=invite_code, skip_sid=request.sid)

@socketio.on('send_message')
def on_send_message(data):
    invite_code = (data.get("inviteCode") or "").strip().upper()
    msg_data    = data.get("message", {})
    text        = (msg_data.get("text") or "").strip()
    sender      = (msg_data.get("sender") or "Inconnu").strip()
    if not invite_code or not text:
        return
    msg = make_message(text, sender)
    if invite_code not in chat_rooms:
        chat_rooms[invite_code] = []
    chat_rooms[invite_code].append(msg)
    if len(chat_rooms[invite_code]) > 200:
        chat_rooms[invite_code] = chat_rooms[invite_code][-200:]
    emit("new_message", msg, to=invite_code)

@socketio.on('leave_room')
def on_leave_room(data):
    invite_code = (data.get("inviteCode") or "").strip().upper()
    username    = (data.get("username")   or "Inconnu").strip()
    leave_room(invite_code)
    sys_msg = make_message(f"{username} a quitté le groupe", "Système", is_system=True)
    if invite_code in chat_rooms:
        chat_rooms[invite_code].append(sys_msg)
    emit("system_message", sys_msg, to=invite_code)

# ──────────────────────────────────────────────────────────────
# AI ROUTES (GROUP)
# ──────────────────────────────────────────────────────────────
@app.route("/api/group-ai-plan", methods=["POST"])
def group_ai_plan():
    body           = request.get_json(force=True) or {}
    participants   = body.get("participants", [])
    fallback_days  = max(1, min(int(body.get("days", 3)), 14))
    fallback_ville = (body.get("ville") or "").strip()

    if not participants or not isinstance(participants, list):
        return jsonify({"error": "Le champ 'participants' (liste non vide) est requis."}), 400

    resolved_prefs = ai.resolve_group_prefs(participants)
    resolved_dates = ai.resolve_dates(participants)

    destinations = [p.get("destination") for p in participants if p.get("destination")]
    ville = ai.majority(destinations) or fallback_ville or "Tunis"
    days  = resolved_dates["num_days"] if resolved_dates["num_days"] > 1 else fallback_days

    city_data = ai.get_city_data(ville)
    if city_data is None:
        return jsonify({"error": f"Ville '{ville}' introuvable.", "hint": "GET /api/cities"}), 404

    hotels     = ai.filter_hotels(city_data["hotels"], resolved_prefs.get("hotel_type", ""),
                                  resolved_prefs.get("hotel_location", ""), resolved_prefs.get("hotel_name"))
    cafes      = ai.filter_cafes(city_data["cafes"], resolved_prefs.get("cafe_style", ""),
                                  resolved_prefs.get("cafe_name"))
    activities = ai.filter_activities(city_data["activities"], resolved_prefs.get("activity_types", []))

    participants_ctx = f"Nombre de participants : {len(participants)}\n"
    for i, p in enumerate(participants, 1):
        name = p.get("full_name") or p.get("email") or f"Participant {i}"
        participants_ctx += f"  · {name} : hôtel={p.get('hotel_type', '?')}, activités={p.get('activity_types', '?')}, budget={p.get('budget', '?')} TND\n"
    participants_ctx += (
        f"\nPréférences résolues :\n"
        f"  Hôtel type      : {resolved_prefs.get('hotel_type', '—')}\n"
        f"  Localisation    : {resolved_prefs.get('hotel_location', '—')}\n"
        f"  Activités       : {', '.join(resolved_prefs.get('activity_types', [])) or '—'}\n"
        f"  Budget moyen    : {resolved_prefs.get('budget_avg', 0):.0f} TND/j"
    )

    dates_ctx = (
        f"Dates : {resolved_dates['date_debut']} → {resolved_dates['date_fin']} ({days} jours) | {resolved_dates['conflict_info']}"
        if resolved_dates.get("date_debut") else ""
    )

    try:
        result = ai.generate_plan_gemini(
            ville=city_data["original_name"], days=days,
            hotels=hotels, cafes=cafes, activities=activities,
            transport=city_data["transport"], meteo=city_data["meteo"],
            prefs=resolved_prefs, participants_ctx=participants_ctx, dates_ctx=dates_ctx
        )
        return jsonify({
            "ville": city_data["original_name"], "days": days,
            "participants_count": len(participants), "resolved_prefs": resolved_prefs,
            "resolved_dates": resolved_dates, "model": "gemini",
            "conseil_global": result.get("conseil_global", ""), "plan": result.get("plan", [])
        })
    except Exception as exc:
        print(f"Gemini group indisponible → fallback local. Raison : {exc}")
        fallback = ai.generate_plan_fallback(
            ville=city_data["original_name"], days=days,
            hotels=hotels, cafes=cafes, activities=activities,
            transport=city_data["transport"], meteo=city_data["meteo"], prefs=resolved_prefs
        )
        return jsonify({
            "ville": city_data["original_name"], "days": days,
            "participants_count": len(participants), "resolved_prefs": resolved_prefs,
            "resolved_dates": resolved_dates, "gemini_error": str(exc),
            **fallback
        })

@app.route("/api/cities", methods=["GET"])
def cities():
    available = ai.list_cities()
    return jsonify({"cities": available, "count": len(available)})

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok", "gemini_ready": ai._gemini is not None,
        "gemini_model": ai.GEMINI_MODEL, "cities_loaded": len(ai.list_cities()),
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })

@app.route('/save-plan', methods=['POST'])
def save_plan():
    data = request.get_json(silent=True) or {}
    plan_code    = (data.get('plan_code') or ('PL' + secrets.token_hex(4).upper())).strip().upper()
    leader_id    = data.get('leader_id')
    leader_email = (data.get('leader_email', '') or '').strip().lower()
    leader_name  = (data.get('leader_name') or leader_email or 'Un voyageur').strip()
    plan         = data.get('plan', {})
    guest_emails = data.get('guest_emails', [])

    if not leader_email or '@' not in leader_email or not plan:
        return jsonify({'error': 'leader_email et plan sont requis'}), 400

    # Nettoyage et dédoublonnage des emails invités
    guest_emails = list({
        e.strip().lower() for e in guest_emails
        if e and isinstance(e, str) and '@' in e.strip() and e.strip().lower() != leader_email
    })

    print(f"[save-plan] plan_code={plan_code} leader={leader_email} guests={guest_emails}")

    destination = plan.get('destination', '') or ''
    date_debut  = ((plan.get('dateDebut', '') or '')[:10]) or None
    date_fin    = ((plan.get('dateFin',   '') or '')[:10]) or None
    nom         = plan.get('nom', 'Voyage') or 'Voyage'

    itinerary  = plan.get('itinerary', [])
    highlights = []
    transports = []
    loisirs    = []

    for day in itinerary:
        title      = str(day.get('title', ''))
        hotel      = day.get('hotel', {})
        hotel_name = str(hotel.get('name', '')) if isinstance(hotel, dict) else str(hotel)
        activity   = str(day.get('activity', ''))

        line = title
        if hotel_name and hotel_name != '':
            line += f' · 🏨 {hotel_name}'
        if activity and activity != '':
            line += f' · 🎯 {activity[:60]}'
        if line.strip():
            highlights.append(line)

        transport = day.get('transport')
        # Si transport est un dictionnaire (cas premium), construire une chaîne lisible
        if isinstance(transport, dict):
            label = str(transport.get('label', ''))
            prix_str = str(transport.get('prixStr', ''))
            transport_str = f"{label} ({prix_str})" if label and prix_str else label or prix_str
        else:
            transport_str = str(transport) if transport else ''
        transports.append({
            'day': title or f'Jour {len(transports)+1}',
            'transport': transport_str
        })

        la = day.get('localActivity')
        if isinstance(la, dict):
            loisirs.append({
                'day':         title or f'Jour {len(loisirs)+1}',
                'name':        str(la.get('name', '')),
                'description': str(la.get('description', '')),
                'prix':        str(la.get('prix', ''))
            })
        elif isinstance(la, str) and la:
            loisirs.append({
                'day':         title or f'Jour {len(loisirs)+1}',
                'name':        la,
                'description': '',
                'prix':        ''
            })
        else:
            loisirs.append({
                'day':  title or f'Jour {len(loisirs)+1}',
                'name': '', 'description': '', 'prix': ''
            })

    # Sauvegarde en base de données
    conn   = None
    cursor = None
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO shared_plans
                (plan_code, leader_id, leader_email, plan_json,
                 transport_json, loisir_json,
                 created_at, destination, date_debut, date_fin, nom)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                leader_id      = VALUES(leader_id),
                leader_email   = VALUES(leader_email),
                plan_json      = VALUES(plan_json),
                transport_json = VALUES(transport_json),
                loisir_json    = VALUES(loisir_json),
                destination    = VALUES(destination),
                date_debut     = VALUES(date_debut),
                date_fin       = VALUES(date_fin),
                nom            = VALUES(nom),
                updated_at     = NOW()
        ''', (
            plan_code, leader_id, leader_email,
            json.dumps(plan,       ensure_ascii=False),
            json.dumps(transports, ensure_ascii=False),
            json.dumps(loisirs,    ensure_ascii=False),
            datetime.utcnow().isoformat(),
            destination, date_debut, date_fin, nom
        ))
        conn.commit()
    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({'error': f'DB error: {str(e)}'}), 500
    finally:
        if cursor:
            try: cursor.close()
            except: pass
        if conn:
            try: conn.close()
            except: pass

    from html import escape
    dest_h   = escape(destination)
    name_h   = escape(leader_name)
    code_h   = escape(plan_code)
    ddebut_h = escape(date_debut or '—')
    dfin_h   = escape(date_fin   or '—')

    results = {}

    if not guest_emails:
        print(f"[save-plan] Aucun email invité à notifier pour plan_code={plan_code}")

    for email in guest_emails:
        print(f"[save-plan] Envoi email à : {email}")
        try:
            # Construction du HTML – on utilise str() sur chaque variable pour éviter les dicts
            highlights_html = ''.join(
                f'<li style="margin:4px 0;color:#374151">{escape(str(h))}</li>'
                for h in highlights[:5]
            )
            transport_rows = ''.join(
                f'''<tr>
                      <td style="padding:6px 8px;color:#374151;font-weight:600;border-bottom:1px solid #DBEAFE">{escape(str(t["day"]))}</td>
                      <td style="padding:6px 8px;color:#1E40AF;border-bottom:1px solid #DBEAFE">
                        {escape(str(t["transport"])) if t["transport"] else '<span style="color:#9CA3AF;font-style:italic">—</span>'}
                      </td>
                    </tr>'''
                for t in transports
            )
            transport_block = f'''
            <div style="margin-top:20px">
              <h3 style="color:#042A66;font-size:15px;margin-bottom:8px">🚌 Transport jour par jour</h3>
              <table style="width:100%;border-collapse:collapse;background:#EFF6FF;border-radius:10px;overflow:hidden;">
                {transport_rows}
              </table>
            </div>''' if any(t["transport"] for t in transports) else ''

            loisir_rows = ''.join(
                f'''<div style="background:#fff;border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid #EDE9FE">
                      <div style="font-weight:700;color:#042A66;font-size:13px;margin-bottom:4px">{escape(str(l["day"]))}</div>
                      <div style="color:#374151;font-size:13px;font-weight:600">🎮 {escape(str(l["name"]))}</div>
                      {f'<div style="color:#7A90B4;font-size:12px;margin-top:3px">{escape(str(l["description"]))}</div>' if l["description"] else ''}
                      {f'<div style="color:#7C3AED;font-size:12px;margin-top:3px;font-weight:600">💰 {escape(str(l["prix"]))}</div>' if l["prix"] else ''}
                    </div>'''
                for l in loisirs if l["name"]
            )
            loisir_block = f'''
            <div style="margin-top:20px">
              <h3 style="color:#042A66;font-size:15px;margin-bottom:8px">🎮 Loisirs &amp; Divertissements</h3>
              {loisir_rows}
            </div>''' if any(l["name"] for l in loisirs) else ''

            html_body = f"""
<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
  <div style="background:linear-gradient(135deg,#042A66,#0A4DBF);padding:32px 24px;text-align:center">
    <div style="font-size:40px;margin-bottom:12px">✈️</div>
    <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800">Votre itinéraire est prêt !</h1>
    <p style="color:rgba(255,255,255,0.75);margin:10px 0 0;font-size:14px">
      <strong style="color:#fff">{name_h}</strong> vous partage un plan de voyage
    </p>
  </div>
  <div style="padding:28px 24px;background:#fff">
    <div style="background:#EEF4FF;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #DBEAFE">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="color:#7A90B4;font-size:13px;padding:4px 0">📍 Destination</td>
          <td style="font-weight:700;text-align:right;color:#042A66;font-size:13px">{dest_h}</td>
        </tr>
        <tr>
          <td style="color:#7A90B4;font-size:13px;padding:4px 0">🛫 Départ</td>
          <td style="font-weight:700;text-align:right;color:#042A66;font-size:13px">{ddebut_h}</td>
        </tr>
        <tr>
          <td style="color:#7A90B4;font-size:13px;padding:4px 0">🛬 Retour</td>
          <td style="font-weight:700;text-align:right;color:#042A66;font-size:13px">{dfin_h}</td>
        </tr>
      </table>
    </div>
    <h3 style="color:#042A66;font-size:15px;margin:0 0 8px">📋 Aperçu du programme :</h3>
    <ul style="padding-left:20px;margin:0 0 8px">{highlights_html}</ul>
    {transport_block}
    {loisir_block}
    <div style="background:linear-gradient(135deg,#C89B3C,#E8B84B);border-radius:14px;padding:24px;text-align:center;margin:24px 0">
      <p style="color:rgba(61,34,0,0.65);font-size:11px;margin:0 0 6px;letter-spacing:2px;text-transform:uppercase">Votre code d'accès</p>
      <p style="color:#3D2200;font-size:34px;font-weight:900;margin:0;letter-spacing:8px;font-family:monospace">{code_h}</p>
    </div>
    <div style="background:#F0FDF4;border-radius:10px;padding:16px;border:1px solid #BBF7D0">
      <p style="color:#166534;font-weight:700;margin:0 0 8px">📱 Comment voir le plan ?</p>
      <ol style="margin:0;padding-left:18px;color:#15803D;font-size:13px;line-height:2">
        <li>Ouvrez l'app <strong>Pack&amp;Go</strong></li>
        <li>Connectez-vous à votre compte</li>
        <li>Entrez le code <strong style="letter-spacing:2px;font-family:monospace">{code_h}</strong></li>
        <li>Appuyez sur <strong>"Voir le plan"</strong></li>
      </ol>
    </div>
    <p style="color:#9CA3AF;font-size:11px;text-align:center;margin-top:20px">
      Ce message a été envoyé automatiquement par Pack&amp;Go · Ne pas répondre
    </p>
  </div>
</div>"""

            msg = Message(
                subject=f'✈️ {leader_name} vous partage un itinéraire vers {destination}',
                recipients=[email]
            )
            msg.html = html_body
            mail.send(msg)
            results[email] = 'envoyé'
            print(f"[save-plan] ✅ Email envoyé à {email}")

        except Exception as e:
            results[email] = f'échec : {str(e)}'
            print(f"[save-plan] ❌ Échec envoi à {email} : {e}")

    sent_count = sum(1 for v in results.values() if v == 'envoyé')
    print(f"[save-plan] Résultat final : {sent_count}/{len(guest_emails)} emails envoyés")

    return jsonify({
        'success':      True,
        'plan_code':    plan_code,
        'nom':          nom,
        'emails_sent':  results,
        'total_guests': len(guest_emails),
        'sent_count':   sent_count,
    })

@app.route('/plan-by-code', methods=['GET'])
def plan_by_code():
    code = (request.args.get('code') or '').strip().upper()
    if len(code) < 4:
        return jsonify({'error': 'Code manquant ou trop court'}), 400
    try:
        conn   = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM shared_plans WHERE plan_code = %s', (code,))
        row = cursor.fetchone()
        cursor.close(); conn.close()
    except Exception as e:
        return jsonify({'error': f'DB error: {e}'}), 500
    if not row:
        return jsonify({'valid': False, 'error': 'Plan introuvable'}), 404
    plan = json.loads(row['plan_json'])
    return jsonify({
        'valid': True, 'plan_code': row['plan_code'],
        'nom': row['nom'], 'destination': row['destination'],
        'date_debut': row['date_debut'], 'date_fin': row['date_fin'],
        'leader_email': row['leader_email'], 'created_at': row['created_at'],
        'plan': plan
    })

# ─────────────────────────────
# POINT D'ENTRÉE
# ─────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)