from functools import wraps
from flask import request, jsonify, session
import re
import os

def get_current_user():
    from models import User
    user_id = session.get('user_id')
    if not user_id:
        token = request.headers.get('X-Auth-Token') or request.cookies.get('auth_token')
        if token:
            import jwt
            try:
                data = jwt.decode(token, os.environ.get('SECRET_KEY', 'qa-wiki-secret-2024'), algorithms=['HS256'])
                user_id = data.get('user_id')
            except jwt.PyJWTError:
                return None
    if user_id:
        return User.query.get(user_id)
    return None

def get_role(user):
    if not user:
        return None
    from models import Role
    slug = user.role_slug or user.role
    return Role.query.filter_by(slug=slug).first()

def has_permission(user, perm):
    if not user:
        return False
    role = get_role(user)
    if not role:
        fallback = {
            'admin': True,
            'qa_engineer': perm in ['create_articles','edit_own_articles','publish_articles',
                                     'manage_categories','export_pdf','add_comments','view_drafts'],
            'developer': perm in ['create_articles','edit_own_articles','export_pdf','add_comments'],
            'viewer': perm in ['export_pdf'],
        }
        return fallback.get(user.role, False)
    return getattr(role, f'perm_{perm}', False)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated

def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401
            if user.role not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

def perm_required(perm):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({'error': 'Authentication required'}), 401
            if not has_permission(user, perm):
                return jsonify({'error': f'Permission denied: {perm}'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

def get_role_category_ids(user):
    """Return the set of allowed category IDs for the user's role.

    Returns None  → no restrictions (show everything).
    Returns set() → role has restrictions; only those IDs (and their
                    descendants, via expand_category_ids) may be shown.
    Admins always get None (unrestricted).
    """
    if not user or user.role == 'admin':
        return None
    role = get_role(user)
    if not role:
        return None
    ids = [ca.category_id for ca in role.category_access.all()]
    if not ids:
        return None  # No restrictions defined — show everything
    return set(ids)


def expand_category_ids(category_ids):
    """Expand a set of category IDs to include all their descendants."""
    from models import Category
    effective = set(category_ids)
    queue = list(category_ids)
    while queue:
        cat_id = queue.pop()
        for child in Category.query.filter_by(parent_id=cat_id).all():
            if child.id not in effective:
                effective.add(child.id)
                queue.append(child.id)
    return effective


def can_edit(user):
    return has_permission(user, 'create_articles') or has_permission(user, 'edit_own_articles')

def can_publish(user):
    return has_permission(user, 'publish_articles')

def slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text

def unique_slug(base_slug, model, exclude_id=None):
    slug = base_slug
    counter = 1
    while True:
        q = model.query.filter_by(slug=slug)
        if exclude_id:
            q = q.filter(model.id != exclude_id)
        if not q.first():
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1
