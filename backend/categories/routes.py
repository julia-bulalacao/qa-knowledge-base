from flask import Blueprint, request, jsonify
from extensions import db
from models import Category, RoleCategoryAccess
from utils import get_current_user, login_required, role_required, perm_required, slugify, unique_slug, get_role_category_ids

categories_bp = Blueprint('categories', __name__)

@categories_bp.route('', methods=['GET'])
@login_required
def list_categories():
    user = get_current_user()
    allowed_ids = get_role_category_ids(user)
    top_cats = Category.query.filter_by(parent_id=None).order_by(Category.order).all()

    if allowed_ids is None:
        # No restrictions — return everything as before
        return jsonify([c.to_dict(include_children=True) for c in top_cats])

    # Build filtered hierarchy:
    # - If the top-level cat itself is in allowed_ids → include it with ALL its children
    # - If the top-level cat is NOT in allowed_ids but some children are → include it
    #   as a navigation container, but only show the allowed children
    # - Otherwise omit the category entirely
    result = []
    for cat in top_cats:
        child_list   = cat.children.order_by(Category.order).all()
        child_id_set = {c.id for c in child_list}

        if cat.id in allowed_ids:
            d = cat.to_dict()
            d['children'] = [c.to_dict() for c in child_list]
            result.append(d)
        elif child_id_set & allowed_ids:
            d = cat.to_dict()
            d['children'] = [c.to_dict() for c in child_list if c.id in allowed_ids]
            result.append(d)
    return jsonify(result)


@categories_bp.route('/flat', methods=['GET'])
@login_required
def flat_categories():
    user = get_current_user()
    allowed_ids = get_role_category_ids(user)
    if allowed_ids is None:
        cats = Category.query.order_by(Category.order).all()
    else:
        cats = Category.query.filter(Category.id.in_(allowed_ids)).order_by(Category.order).all()
    return jsonify([c.to_dict() for c in cats])

@categories_bp.route('', methods=['POST'])
@perm_required('manage_categories')
def create_category():
    data = request.get_json()
    slug = unique_slug(slugify(data['name']), Category)
    cat = Category(
        name=data['name'], slug=slug,
        description=data.get('description', ''),
        icon=data.get('icon', '📁'),
        color=data.get('color', '#6366f1'),
        parent_id=data.get('parent_id'),
        order=data.get('order', 0)
    )
    db.session.add(cat)
    db.session.flush()  # get cat.id before writing access rows
    _save_role_access(cat.id, data.get('role_ids', []))
    db.session.commit()
    return jsonify(cat.to_dict()), 201

@categories_bp.route('/<int:cat_id>', methods=['PUT'])
@perm_required('manage_categories')
def update_category(cat_id):
    cat = Category.query.get_or_404(cat_id)
    data = request.get_json()
    for f in ['name', 'description', 'icon', 'color', 'parent_id', 'order']:
        if f in data:
            setattr(cat, f, data[f])
    if 'role_ids' in data:
        _save_role_access(cat.id, data['role_ids'])
    db.session.commit()
    return jsonify(cat.to_dict())


def _save_role_access(category_id, role_ids):
    """Replace the role_category_access rows for this category."""
    RoleCategoryAccess.query.filter_by(category_id=category_id).delete(synchronize_session=False)
    for role_id in role_ids:
        db.session.add(RoleCategoryAccess(role_id=int(role_id), category_id=category_id))

@categories_bp.route('/<int:cat_id>', methods=['DELETE'])
@perm_required('manage_categories')
def delete_category(cat_id):
    cat = Category.query.get_or_404(cat_id)
    db.session.delete(cat)
    db.session.commit()
    return jsonify({'message': 'Deleted'})
