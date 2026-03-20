from flask import Blueprint, request, jsonify
from extensions import db
from models import Category
from utils import get_current_user, login_required, role_required, perm_required, slugify, unique_slug

categories_bp = Blueprint('categories', __name__)

@categories_bp.route('', methods=['GET'])
@login_required
def list_categories():
    cats = Category.query.filter_by(parent_id=None).order_by(Category.order).all()
    return jsonify([c.to_dict(include_children=True) for c in cats])

@categories_bp.route('/flat', methods=['GET'])
@login_required
def flat_categories():
    cats = Category.query.order_by(Category.order).all()
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
    db.session.commit()
    return jsonify(cat.to_dict())

@categories_bp.route('/<int:cat_id>', methods=['DELETE'])
@perm_required('manage_categories')
def delete_category(cat_id):
    cat = Category.query.get_or_404(cat_id)
    db.session.delete(cat)
    db.session.commit()
    return jsonify({'message': 'Deleted'})
