from flask import Blueprint, request, jsonify
from extensions import db
from models import Comment, Article
from utils import get_current_user, login_required, perm_required, has_permission

comments_bp = Blueprint('comments', __name__)

@comments_bp.route('/article/<int:article_id>', methods=['POST'])
@perm_required('add_comments')
def add_comment(article_id):
    user = get_current_user()
    Article.query.get_or_404(article_id)
    data = request.get_json()
    comment = Comment(article_id=article_id, user_id=user.id, content=data['content'])
    db.session.add(comment)
    db.session.commit()
    return jsonify(comment.to_dict()), 201

@comments_bp.route('/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    user = get_current_user()
    comment = Comment.query.get_or_404(comment_id)
    if not has_permission(user, 'manage_users') and comment.user_id != user.id:
        return jsonify({'error': 'Cannot delete this comment'}), 403
    db.session.delete(comment)
    db.session.commit()
    return jsonify({'message': 'Deleted'})
