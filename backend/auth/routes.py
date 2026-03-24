from flask import Blueprint, request, jsonify, session
from extensions import db, bcrypt
from models import User
from utils import get_current_user, login_required
import jwt, datetime, os

auth_bp = Blueprint('auth', __name__)

def make_token(user_id):
    return jwt.encode({
        'user_id': user_id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, os.environ.get('SECRET_KEY', 'qa-wiki-secret-2024'), algorithm='HS256')

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')
    if len(name) < 2:
        return jsonify({'error': 'Name must be at least 2 characters'}), 400
    if not email or '@' not in email:
        return jsonify({'error': 'A valid email is required'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with this email already exists'}), 400
    hashed = bcrypt.generate_password_hash(password).decode('utf-8')
    user = User(name=name, email=email, password=hashed, role='viewer', role_slug='viewer', is_active=True)
    db.session.add(user)
    db.session.commit()
    token = make_token(user.id)
    return jsonify({'user': user.to_dict(), 'token': token}), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data.get('email')).first()
    if not user or not bcrypt.check_password_hash(user.password, data.get('password', '')):
        return jsonify({'error': 'Invalid credentials'}), 401
    if not user.is_active:
        return jsonify({'error': 'Account disabled'}), 403
    session['user_id'] = user.id
    token = make_token(user.id)
    return jsonify({'user': user.to_dict(), 'token': token})

@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'})

@auth_bp.route('/me', methods=['GET'])
@login_required
def me():
    return jsonify(get_current_user().to_dict())

@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    user = get_current_user()
    data = request.get_json()
    if not bcrypt.check_password_hash(user.password, data.get('current_password', '')):
        return jsonify({'error': 'Current password incorrect'}), 400
    new_password = data.get('new_password', '')
    if not new_password or len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400
    user.password = bcrypt.generate_password_hash(new_password).decode('utf-8')
    db.session.commit()
    return jsonify({'message': 'Password updated'})


@auth_bp.route('/permissions', methods=['GET'])
@login_required
def get_permissions():
    from utils import get_role, has_permission
    user = get_current_user()
    perms = [
        'create_articles','edit_any_article','edit_own_articles','publish_articles',
        'delete_articles','manage_categories','manage_users','export_pdf',
        'add_comments','view_drafts'
    ]
    return jsonify({p: has_permission(user, p) for p in perms})

@auth_bp.route('/profile-update', methods=['PUT'])
@login_required
def update_profile():
    user = get_current_user()
    data = request.get_json()
    if 'email' in data and data['email'] != user.email:
        if User.query.filter(User.email == data['email'], User.id != user.id).first():
            return jsonify({'error': 'Email already in use by another account'}), 400
    for f in ['name', 'avatar_color', 'email']:
        if f in data:
            setattr(user, f, data[f])
    db.session.commit()
    return jsonify(user.to_dict())
