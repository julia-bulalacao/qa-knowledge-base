from flask import Blueprint, request, jsonify
from extensions import db, bcrypt
from models import User
from utils import get_current_user, login_required, role_required, perm_required

users_bp = Blueprint('users', __name__)

@users_bp.route('', methods=['GET'])
@perm_required('manage_users')
def list_users():
    users = User.query.order_by(User.created_at).all()
    return jsonify([u.to_dict() for u in users])

@users_bp.route('', methods=['POST'])
@perm_required('manage_users')
def create_user():
    data = request.get_json()
    if User.query.filter_by(email=data.get('email')).first():
        return jsonify({'error': 'Email already exists'}), 400
    if not data.get('password'):
        return jsonify({'error': 'Password is required'}), 400
    role_slug = data.get('role', 'viewer')
    user = User(
        name=data['name'],
        email=data['email'],
        password=bcrypt.generate_password_hash(data['password']).decode('utf-8'),
        role=role_slug,
        role_slug=role_slug,
        avatar_color=data.get('avatar_color', '#6366f1'),
        is_active=True
    )
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201

@users_bp.route('/<int:user_id>', methods=['PUT'])
@perm_required('manage_users')
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json()
    for f in ['name', 'role', 'avatar_color']:
        if f in data:
            setattr(user, f, data[f])
    if 'role' in data:
        user.role_slug = data['role']
    if 'is_active' in data:
        user.is_active = data['is_active']
    if data.get('password'):
        user.password = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    db.session.commit()
    return jsonify(user.to_dict())

@users_bp.route('/<int:user_id>', methods=['DELETE'])
@perm_required('manage_users')
def delete_user(user_id):
    from models import Article
    current = get_current_user()
    if current.id == user_id:
        return jsonify({'error': 'Cannot delete yourself'}), 400
    user = User.query.get_or_404(user_id)
    if Article.query.filter_by(author_id=user_id).first():
        return jsonify({'error': 'Cannot delete a user who has authored articles. Reassign their articles first.'}), 400
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'Deleted'})
