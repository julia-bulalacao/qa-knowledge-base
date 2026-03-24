from flask import Blueprint, jsonify, request
from extensions import db
from models import Article, ArticleRoleAccess, Category, User, Tag
from utils import login_required, get_current_user, get_role_category_ids, expand_category_ids
from sqlalchemy import func, or_, exists as sa_exists

dashboard_bp = Blueprint('dashboard', __name__)

def _dashboard_base_query(user):
    """Return a published-article query filtered by the user's role access.
    Uses EXISTS subqueries on article_role_access — exact match, index-friendly."""
    q = Article.query.filter_by(status='published')

    if user.role == 'admin':
        return q

    user_role = user.role_slug or user.role

    # Articles with NO rows in article_role_access are visible to everyone.
    # Articles WITH rows are visible only to roles listed there.
    has_restrictions = sa_exists().where(ArticleRoleAccess.article_id == Article.id)
    user_is_allowed  = sa_exists().where(
        (ArticleRoleAccess.article_id == Article.id) &
        (ArticleRoleAccess.role_slug  == user_role)
    )
    q = q.filter(~has_restrictions | user_is_allowed)

    # Category-level access filter
    allowed_cat_ids = get_role_category_ids(user)
    if allowed_cat_ids is not None:
        effective = expand_category_ids(allowed_cat_ids)
        q = q.filter(or_(Article.category_id.is_(None), Article.category_id.in_(effective)))

    return q


@dashboard_bp.route('', methods=['GET'])
@login_required
def get_dashboard():
    user = get_current_user()
    base_q = _dashboard_base_query(user)

    from utils import has_permission
    total  = base_q.count()
    drafts = Article.query.filter_by(status='draft').count() if has_permission(user, 'view_drafts') else 0

    by_type = dict(
        db.session.query(Article.content_type, func.count(Article.id))
        .filter(Article.id.in_(base_q.with_entities(Article.id)))
        .group_by(Article.content_type).all()
    )
    by_cat = (
        db.session.query(Category.name, func.count(Article.id))
        .join(Article, Article.category_id == Category.id)
        .filter(Article.id.in_(base_q.with_entities(Article.id)))
        .group_by(Category.id)
        .order_by(func.count(Article.id).desc())
        .limit(8).all()
    )
    top_viewed = base_q.order_by(Article.view_count.desc()).limit(5).all()
    recent     = base_q.order_by(Article.updated_at.desc()).limit(8).all()

    # Category count: only categories the user can see
    allowed_cat_ids = get_role_category_ids(user)
    if allowed_cat_ids is not None:
        effective = expand_category_ids(allowed_cat_ids)
        total_cats = Category.query.filter(Category.id.in_(effective)).count()
    else:
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
    ann_id = SiteSettings.get('announcement_id', '')
    return jsonify({'announcement': msg, 'id': ann_id})

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
    SiteSettings.set('announcement_id', str(data.get('id', '')), user.id)
    return jsonify({'announcement': data.get('message', ''), 'id': data.get('id', '')})

