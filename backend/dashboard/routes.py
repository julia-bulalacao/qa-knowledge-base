from flask import Blueprint, jsonify, request
from extensions import db
from models import Article, Category, User, Tag
from utils import login_required, get_current_user
from sqlalchemy import func

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('', methods=['GET'])
@login_required
def get_dashboard():
    total = Article.query.filter_by(status='published').count()
    drafts = Article.query.filter_by(status='draft').count()
    by_type = dict(db.session.query(Article.content_type, func.count(Article.id)).filter_by(status='published').group_by(Article.content_type).all())
    by_cat = db.session.query(Category.name, func.count(Article.id)).join(Article, Article.category_id == Category.id).filter(Article.status == 'published').group_by(Category.id).order_by(func.count(Article.id).desc()).limit(8).all()
    top_viewed = Article.query.filter_by(status='published').order_by(Article.view_count.desc()).limit(5).all()
    recent = Article.query.filter_by(status='published').order_by(Article.updated_at.desc()).limit(8).all()
    total_cats = Category.query.count()
    total_tags = Tag.query.count()

    return jsonify({
        'total_articles': total,
        'draft_articles': drafts,
        'total_categories': total_cats,
        'total_tags': total_tags,
        'by_type': by_type,
        'by_category': [{'name': n, 'count': c} for n, c in by_cat],
        'top_viewed': [a.to_dict() for a in top_viewed],
        'recent_articles': [a.to_dict() for a in recent],
    })

@dashboard_bp.route('/announcement', methods=['GET'])
@login_required
def get_announcement():
    from models import SiteSettings
    msg = SiteSettings.get('announcement', '')
    return jsonify({'announcement': msg})

@dashboard_bp.route('/announcement', methods=['PUT'])
@login_required
def set_announcement():
    from models import SiteSettings
    from utils import has_permission
    user = get_current_user()
    if not has_permission(user, 'manage_users'):
        return jsonify({'error': 'No permission'}), 403
    data = request.get_json()
    SiteSettings.set('announcement', data.get('message', ''), user.id)
    return jsonify({'announcement': data.get('message', '')})

