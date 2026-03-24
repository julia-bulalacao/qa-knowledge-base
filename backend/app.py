from flask import Flask, send_from_directory
from flask_cors import CORS
from extensions import db, bcrypt
import os

def create_app():
    app = Flask(__name__, static_folder='static')
    app.config['SECRET_KEY'] = 'qa-wiki-secret-2024'
    import os
    # Use DATABASE_URL (PostgreSQL) if set, fallback to local SQLite
    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        # Fix for psycopg2 - replace postgres:// with postgresql://
        if database_url.startswith('postgres://'):
            database_url = database_url.replace('postgres://', 'postgresql://', 1)
        app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    else:
        db_path = os.path.join(app.instance_path, 'wiki.db')
        os.makedirs(app.instance_path, exist_ok=True)
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'qa-wiki-secret-2024')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    bcrypt.init_app(app)
    allowed_origins = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:5001').split(',')
    CORS(app, supports_credentials=True, origins=[o.strip() for o in allowed_origins])

    from auth.routes import auth_bp
    from articles.routes import articles_bp
    from categories.routes import categories_bp
    from comments.routes import comments_bp
    from dashboard.routes import dashboard_bp
    from users.routes import users_bp
    from roles.routes import roles_bp
    from articles.upload import upload_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(articles_bp, url_prefix='/api/articles')
    app.register_blueprint(categories_bp, url_prefix='/api/categories')
    app.register_blueprint(comments_bp, url_prefix='/api/comments')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(roles_bp, url_prefix='/api/roles')
    app.register_blueprint(upload_bp, url_prefix='/api/uploads')

    @app.after_request
    def add_charset(response):
        if response.content_type and 'javascript' in response.content_type:
            response.headers['Content-Type'] = 'application/javascript; charset=utf-8'
        if response.content_type and 'text/html' in response.content_type:
            response.headers['Content-Type'] = 'text/html; charset=utf-8'
        return response

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, 'index.html')

    with app.app_context():
        db.create_all()
        seed()
        _backfill_role_slugs()

    return app

def _backfill_role_slugs():
    """One-time fix: sync role_slug from role for users where role_slug is NULL.
    Exits immediately if no such users exist to avoid unnecessary work on every startup."""
    from models import User
    users = User.query.filter(User.role_slug.is_(None)).all()
    if not users:
        return
    for u in users:
        if u.role:
            u.role_slug = u.role
    db.session.commit()

def seed():
    from models import User, Category, Tag, Article
    if User.query.first():
        return

    # Users
    from models import Role
    # Seed roles first
    if not Role.query.first():
        roles_data = [
            Role(name='Admin', slug='admin', description='Full access to everything', color='#ef4444', is_system=True,
                 perm_create_articles=True, perm_edit_any_article=True, perm_edit_own_articles=True,
                 perm_publish_articles=True, perm_delete_articles=True, perm_manage_categories=True,
                 perm_manage_users=True, perm_export_pdf=True, perm_add_comments=True, perm_view_drafts=True),
            Role(name='QA Engineer', slug='qa_engineer', description='Create, edit, and publish articles', color='#3b82f6', is_system=True,
                 perm_create_articles=True, perm_edit_any_article=False, perm_edit_own_articles=True,
                 perm_publish_articles=True, perm_delete_articles=False, perm_manage_categories=True,
                 perm_manage_users=False, perm_export_pdf=True, perm_add_comments=True, perm_view_drafts=True),
            Role(name='Developer', slug='developer', description='Create and edit own articles', color='#10b981', is_system=True,
                 perm_create_articles=True, perm_edit_any_article=False, perm_edit_own_articles=True,
                 perm_publish_articles=False, perm_delete_articles=False, perm_manage_categories=False,
                 perm_manage_users=False, perm_export_pdf=True, perm_add_comments=True, perm_view_drafts=False),
            Role(name='Viewer', slug='viewer', description='Read-only access', color='#6366f1', is_system=True,
                 perm_create_articles=False, perm_edit_any_article=False, perm_edit_own_articles=False,
                 perm_publish_articles=False, perm_delete_articles=False, perm_manage_categories=False,
                 perm_manage_users=False, perm_export_pdf=True, perm_add_comments=False, perm_view_drafts=False),
        ]
        for r in roles_data:
            db.session.add(r)
        db.session.flush()

    users = [
        User(name='Admin User', email='admin@qa.dev', password=bcrypt.generate_password_hash('Admin@123').decode('utf-8'), role='admin', role_slug='admin', avatar_color='#ef4444'),
        User(name='QA Engineer', email='qa@qa.dev', password=bcrypt.generate_password_hash('QA@12345').decode('utf-8'), role='qa_engineer', role_slug='qa_engineer', avatar_color='#3b82f6'),
        User(name='Dev Engineer', email='dev@qa.dev', password=bcrypt.generate_password_hash('Dev@1234').decode('utf-8'), role='developer', role_slug='developer', avatar_color='#10b981'),
        User(name='View Only', email='viewer@qa.dev', password=bcrypt.generate_password_hash('View@123').decode('utf-8'), role='viewer', role_slug='viewer', avatar_color='#6366f1'),
    ]
    for u in users:
        db.session.add(u)
    db.session.flush()

    admin = users[0]
    qa = users[1]

    # Categories
    cats = [
        Category(name='SOPs & Work Instructions', slug='sops', icon='📋', color='#3b82f6', description='Standard Operating Procedures and step-by-step work instructions', order=1),
        Category(name='Onboarding Guides', slug='onboarding', icon='🚀', color='#10b981', description='Everything a new team member needs to get started', order=2),
        Category(name='Bug Fixes & Solutions', slug='bug-fixes', icon='🐛', color='#ef4444', description='Documented issues and their solutions for future reference', order=3),
        Category(name='Internal Procedures', slug='procedures', icon='⚙️', color='#8b5cf6', description='Internal team processes and standards', order=4),
        Category(name='Tools & Setup', slug='tools-setup', icon='🔧', color='#f59e0b', description='Tool installation guides and environment setup', order=5),
    ]
    for c in cats:
        db.session.add(c)
    db.session.flush()

    # Tags
    tag_names = ['Robot Framework', 'SeleniumLibrary', 'Python', 'Git', 'API Testing', 'Regression', 'Onboarding', 'Bug Fix', 'Configuration', 'CI/CD', 'Redmine', 'Best Practice']
    tags = [Tag(name=t) for t in tag_names]
    for t in tags:
        db.session.add(t)
    db.session.flush()

    # Sample articles
    articles_data = [
        {
            'title': 'QA Team Onboarding Guide',
            'content_type': 'onboarding',
            'category': cats[1],
            'author': admin,
            'is_pinned': True,
            'status': 'published',
            'excerpt': 'Complete guide for new QA team members — tools, access, workflows, and expectations.',
            'content': """# QA Team Onboarding Guide

Welcome to the team! This guide will walk you through everything you need to get started.

## Day 1 Checklist

- [ ] Get your workstation set up
- [ ] Request access to all required tools (see Tools & Access section)
- [ ] Meet with your team lead for a walkthrough
- [ ] Read through the Team Standards doc
- [ ] Join all relevant Slack/Teams channels

## Required Tools

### 1. Python 3.10+
Download from [python.org](https://python.org). Make sure to check **Add to PATH** during installation.

```bash
python --version  # Should show 3.10 or higher
```

### 2. Robot Framework + SeleniumLibrary
```bash
pip install robotframework
pip install robotframework-seleniumlibrary
pip install robotframework-faker
```

### 3. Git
Download from [git-scm.com](https://git-scm.com). Configure your identity:
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@company.com"
```

### 4. VS Code + Extensions
- Python extension
- Robot Framework Language Server
- GitLens

## Access Requests

Submit access requests to Admin for:
- Redmine (project tracking)
- GitHub organization
- Test environment credentials (QA, UAT)
- VPN access (if remote)

## Team Channels

- `#qa-team` — General QA discussions
- `#qa-automation` — Automation scripts and issues
- `#qa-bugs` — Bug reports and triage
- `#deployments` — Release and deployment notifications

## Your First Week

**Day 1–2:** Environment setup + tool installation  
**Day 3:** Shadow a senior QA on a test run  
**Day 4:** Read existing test cases and automation scripts  
**Day 5:** Run your first automated test suite  

Any questions? Ping your team lead or post in `#qa-team`!
""",
            'tags': [tags[6], tags[0]]
        },
        {
            'title': 'How to Set Up Robot Framework from Scratch',
            'content_type': 'sop',
            'category': cats[0],
            'author': qa,
            'is_pinned': False,
            'status': 'published',
            'excerpt': 'Step-by-step SOP for installing and configuring Robot Framework with SeleniumLibrary on Windows.',
            'content': """# SOP: Robot Framework Setup (Windows)

**Version:** 1.0  
**Last Updated:** March 2026  
**Owner:** QA Team

---

## Prerequisites

- Windows 10/11
- Python 3.10+ installed
- Admin rights on your machine

---

## Step 1: Install Python Packages

Open PowerShell as Administrator and run:

```bash
pip install robotframework
pip install robotframework-seleniumlibrary
pip install robotframework-faker
pip install robotframework-requests
```

Verify installation:
```bash
robot --version
```

## Step 2: Install ChromeDriver

Download ChromeDriver matching your Chrome version from [chromedriver.chromium.org](https://chromedriver.chromium.org).

Place `chromedriver.exe` in:
```
C:\\Windows\\System32\\
```

Or add to your PATH.

## Step 3: Create Your First Test

Create `test_login.robot`:

```robot
*** Settings ***
Library    SeleniumLibrary

*** Variables ***
${URL}     https://your-app.com
${BROWSER}  chrome

*** Test Cases ***
Valid Login
    Open Browser    ${URL}    ${BROWSER}
    Input Text    id:email    qa@qa.dev
    Input Password    id:password    QA@12345
    Click Button    xpath://button[@type='submit']
    Page Should Contain    Dashboard
    [Teardown]    Close Browser
```

## Step 4: Run Your Test

```bash
robot test_login.robot
```

Output files will be generated:
- `output.xml` — raw results
- `log.html` — detailed log
- `report.html` — summary report

---

## Troubleshooting

**ChromeDriver version mismatch:**  
Update ChromeDriver to match your installed Chrome version.

**ElementNotFound errors:**  
Add explicit waits: `Wait Until Element Is Visible    locator    timeout=10s`

**Import errors:**  
Ensure all packages are installed in the same Python environment.
""",
            'tags': [tags[0], tags[1], tags[2]]
        },
        {
            'title': 'ElementClickInterceptedException — Iframe Overlay Fix',
            'content_type': 'bug_fix',
            'category': cats[2],
            'author': qa,
            'is_pinned': False,
            'status': 'published',
            'excerpt': 'Fix for ElementClickInterceptedException caused by iframe overlays in Robot Framework/Selenium tests.',
            'content': """# Bug Fix: ElementClickInterceptedException (Iframe Overlay)

**Encountered by:** QA Team  
**Environment:** Robot Framework + SeleniumLibrary  
**Date:** March 2026

---

## Problem

Test fails with:
```
ElementClickInterceptedException: element click intercepted: Element is not clickable at point (x, y). 
Other element would receive the click: <div class="modal-overlay">
```

This usually happens when:
- A modal or overlay is visible on top of the element
- An iframe is blocking the click
- Page is still loading when click is attempted

---

## Root Cause

The test was attempting to click a button inside an `<iframe>` without first switching context to that iframe. The Selenium driver was trying to click in the main document context while the element existed inside a nested frame.

---

## Fix

### Option 1: Switch to iframe context first (preferred)

```robot
*** Keywords ***
Click Element Inside Iframe
    [Arguments]    ${iframe_locator}    ${element_locator}
    Select Frame    ${iframe_locator}
    Wait Until Element Is Visible    ${element_locator}    timeout=10s
    Click Element    ${element_locator}
    Unselect Frame
```

### Option 2: JavaScript click fallback

Use when the element is in DOM but blocked by an overlay:

```robot
*** Keywords ***
Force Click Element
    [Arguments]    ${locator}
    ${element}=    Get WebElement    ${locator}
    Execute Javascript    arguments[0].click();    ARGUMENTS    ${element}
```

### Option 3: Wait for overlay to disappear

```robot
Wait Until Element Is Not Visible    css:.modal-overlay    timeout=15s
Click Element    ${your_locator}
```

---

## Prevention

Always check for iframes on pages with embedded content. Add this to your page object:

```robot
*** Keywords ***
Safe Click
    [Arguments]    ${locator}
    Wait Until Element Is Visible    ${locator}    timeout=10s
    Scroll Element Into View    ${locator}
    Click Element    ${locator}
```

---

## Related Issues
- `StaleElementReferenceException` — element found but DOM refreshed before click
- `TimeoutException` — element never became visible
""",
            'tags': [tags[0], tags[1], tags[7]]
        },
        {
            'title': 'Git Workflow for QA Automation Team',
            'content_type': 'procedure',
            'category': cats[3],
            'author': admin,
            'is_pinned': True,
            'status': 'published',
            'excerpt': 'Standard git workflow, branch naming conventions, and PR process for the QA automation team.',
            'content': """# Git Workflow — QA Automation Team

**Version:** 2.0  
**Owner:** QA Lead

---

## Branch Strategy

```
main          ← stable, always deployable
develop       ← integration branch
feature/*     ← new test scripts
fix/*         ← bug fixes to existing scripts
hotfix/*      ← urgent fixes to main
```

## Branch Naming Convention

```bash
feature/TICKET-123-login-automation
fix/TICKET-456-fix-dropdown-locator
hotfix/prod-login-broken
```

Always include the Redmine ticket number!

---

## Daily Workflow

### Starting new work:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/TICKET-123-your-feature
```

### Saving work in progress:

```bash
git add .
git commit -m "TICKET-123: Add login test cases for forgot password flow"
git push origin feature/TICKET-123-your-feature
```

### Before submitting PR:

```bash
# Get latest changes from develop
git fetch origin
git rebase origin/develop

# Fix any conflicts, then
git push origin feature/TICKET-123-your-feature --force-with-lease
```

---

## Commit Message Format

```
TICKET-XXX: Short description (max 72 chars)

Optional longer description explaining WHY, not what.
The code shows what — the message explains the reasoning.
```

**Examples:**
```
TICKET-101: Add radio button state detection via JavaScript
TICKET-102: Fix Bootstrap visibility check for hidden dropdowns  
TICKET-103: Refactor login keywords to use FakerLibrary
```

---

## PR Checklist

Before opening a PR, make sure:
- [ ] Scripts run locally without errors
- [ ] No hardcoded credentials or test data
- [ ] Keywords are properly documented
- [ ] No debug `Log To Console` left in code
- [ ] `robot --dryrun` passes

Assign PR to your team lead for review.

---

## Emergency: Stash and Switch

If you need to drop everything and fix something else:

```bash
git stash push -m "WIP: half-done login test"
git checkout develop
git checkout -b hotfix/urgent-fix
# ... do the fix ...
git checkout your-original-branch
git stash pop
```
""",
            'tags': [tags[3], tags[11]]
        },
        {
            'title': 'Redmine Ticket Workflow — QA Process',
            'content_type': 'sop',
            'category': cats[0],
            'author': qa,
            'is_pinned': False,
            'status': 'published',
            'excerpt': 'How to create, update, and close Redmine tickets following the QA team standard process.',
            'content': """# SOP: Redmine Ticket Workflow

**Version:** 1.1  
**Owner:** QA Team

---

## Ticket Statuses

| Status | Meaning |
|--------|---------|
| New | Just created, not yet assigned |
| In Progress | Being actively worked on |
| Testing | Ready for QA verification |
| Resolved | Fix implemented and verified |
| Closed | Fully done, no further action |
| Rejected | Won't fix or duplicate |

---

## Creating a Bug Ticket

Required fields:
1. **Subject** — clear, specific description
2. **Description** — steps to reproduce, expected vs actual
3. **Priority** — Low / Normal / High / Urgent
4. **Assigned To** — responsible developer
5. **Category** — Frontend / Backend / API / Database
6. **Target Version** — which sprint/release

**Subject format:**
```
[MODULE] Short description of the issue
```
Example: `[AUTH] Login button frozen after 3 failed attempts`

---

## QA Verification Steps

When a ticket moves to **Testing**:

1. Read the fix description in the ticket
2. Check out the relevant branch (if automation fix)
3. Run the test case(s) related to the fix
4. If PASS → change status to **Resolved**, add comment with test result
5. If FAIL → change status back to **In Progress**, tag the dev, explain what still fails

---

## Closing Tickets

Tickets are **Closed** (not just Resolved) only after:
- Fix is deployed to the target environment
- Regression pass is done for related test cases
- No new issues found in 1 sprint

---

## Tips

- Always link related tickets using the **Related Issues** field
- Attach screenshots for UI bugs
- If a fix breaks something else, open a NEW ticket and link it
- Never close your own tickets — always have another person verify
""",
            'tags': [tags[10], tags[11]]
        },
    ]

    for data in articles_data:
        article = Article(
            title=data['title'],
            slug=data['title'].lower().replace(' ', '-').replace('/', '-').replace(':', '').replace('(', '').replace(')', '').replace(',', '').replace('.', ''),
            content=data['content'],
            excerpt=data['excerpt'],
            content_type=data['content_type'],
            status=data['status'],
            category_id=data['category'].id,
            author_id=data['author'].id,
            is_pinned=data['is_pinned'],
            version=1,
        )
        if article.status == 'published':
            from datetime import datetime
            article.published_at = datetime.utcnow()
        for t in data.get('tags', []):
            article.tags.append(t)
        db.session.add(article)

    db.session.commit()

if __name__ == '__main__':
    application = create_app()
    application.run(debug=False, port=5001)
