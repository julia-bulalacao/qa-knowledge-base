from flask import Blueprint, request, jsonify, session
from extensions import db, bcrypt
from models import User
from utils import get_current_user, login_required
import jwt, datetime

auth_bp = Blueprint('auth', __name__)

def make_token(user_id):
    return jwt.encode({
        'user_id': user_id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, 'qa-wiki-secret-2024', algorithm='HS256')

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
    user.password = bcrypt.generate_password_hash(data['new_password']).decode('utf-8')
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
    for f in ['name', 'avatar_color', 'email']:
        if f in data:
            setattr(user, f, data[f])
    db.session.commit()
    return jsonify(user.to_dict())
