from flask import Blueprint, request, jsonify
from extensions import db
from models import Role, User
from utils import login_required, role_required, get_current_user
import re

roles_bp = Blueprint('roles', __name__)

def slugify(name):
    return re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')

@roles_bp.route('', methods=['GET'])
@login_required
def list_roles():
    roles = Role.query.order_by(Role.is_system.desc(), Role.name).all()
    return jsonify([r.to_dict() for r in roles])

@roles_bp.route('', methods=['POST'])
@role_required('admin')
def create_role():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    slug = slugify(name)
    if Role.query.filter_by(slug=slug).first():
        slug = slug + '_' + str(Role.query.count() + 1)
    perms = data.get('permissions', {})
    role = Role(
        name=name, slug=slug,
        description=data.get('description', ''),
        color=data.get('color', '#6366f1'),
        is_system=False,
        perm_create_articles=perms.get('create_articles', False),
        perm_edit_any_article=perms.get('edit_any_article', False),
        perm_edit_own_articles=perms.get('edit_own_articles', False),
        perm_publish_articles=perms.get('publish_articles', False),
        perm_delete_articles=perms.get('delete_articles', False),
        perm_manage_categories=perms.get('manage_categories', False),
        perm_manage_users=perms.get('manage_users', False),
        perm_export_pdf=perms.get('export_pdf', True),
        perm_add_comments=perms.get('add_comments', False),
        perm_view_drafts=perms.get('view_drafts', False),
    )
    db.session.add(role)
    db.session.commit()
    return jsonify(role.to_dict()), 201

@roles_bp.route('/<int:role_id>', methods=['PUT'])
@role_required('admin')
def update_role(role_id):
    role = Role.query.get_or_404(role_id)
    data = request.get_json()
    if 'name' in data and data['name'].strip():
        role.name = data['name'].strip()
    for f in ['description', 'color']:
        if f in data:
            setattr(role, f, data[f])
    perms = data.get('permissions', {})
    for pf in ['create_articles','edit_any_article','edit_own_articles','publish_articles',
               'delete_articles','manage_categories','manage_users','export_pdf','add_comments','view_drafts']:
        if pf in perms:
            setattr(role, 'perm_' + pf, perms[pf])
    db.session.commit()
    return jsonify(role.to_dict())

@roles_bp.route('/<int:role_id>', methods=['DELETE'])
@role_required('admin')
def delete_role(role_id):
    role = Role.query.get_or_404(role_id)
    if role.is_system:
        return jsonify({'error': 'Cannot delete system roles'}), 400
    if role.users.count() > 0:
        return jsonify({'error': f'Cannot delete: {role.users.count()} user(s) still assigned'}), 400
    db.session.delete(role)
    db.session.commit()
    return jsonify({'message': 'Deleted'})

@roles_bp.route('/assign/<int:user_id>', methods=['PUT'])
@role_required('admin')
def assign_role(user_id):
    current = get_current_user()
    if current.id == user_id:
        return jsonify({'error': 'Cannot change your own role'}), 400
    user = User.query.get_or_404(user_id)
    data = request.get_json()
    slug = data.get('role_slug')
    role = Role.query.filter_by(slug=slug).first()
    if not role:
        return jsonify({'error': 'Role not found'}), 404
    user.role = slug
    user.role_slug = slug
    db.session.commit()
    return jsonify(user.to_dict())
