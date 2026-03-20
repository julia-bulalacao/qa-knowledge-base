from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Preformatted, Table, TableStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
import re, io

# Brand colors
ACCENT = colors.HexColor('#b5451b')
TEXT = colors.HexColor('#1a1714')
TEXT2 = colors.HexColor('#5a524a')
TEXT3 = colors.HexColor('#9b9189')
BG2 = colors.HexColor('#f3f1ed')
BORDER = colors.HexColor('#e5e1d8')
CODE_BG = colors.HexColor('#1a1714')
CODE_FG = colors.HexColor('#e2e8f0')

TYPE_COLORS = {
    'sop': colors.HexColor('#1d5fa8'),
    'onboarding': colors.HexColor('#2d7a4f'),
    'bug_fix': colors.HexColor('#b5241b'),
    'procedure': colors.HexColor('#6b4fa8'),
    'guide': colors.HexColor('#b07d12'),
    'article': colors.HexColor('#5a524a'),
}
TYPE_LABELS = {
    'sop': 'SOP', 'onboarding': 'Onboarding Guide',
    'bug_fix': 'Bug Fix', 'procedure': 'Procedure',
    'guide': 'Guide', 'article': 'Article'
}

def generate_article_pdf(article):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=2.5*cm, leftMargin=2.5*cm,
        topMargin=2.5*cm, bottomMargin=2.5*cm,
        title=article.title,
        author=article.author.name if article.author else 'QA Team'
    )

    styles = getSampleStyleSheet()
    type_color = TYPE_COLORS.get(article.content_type, TEXT2)
    type_label = TYPE_LABELS.get(article.content_type, 'Article')

    # Custom styles
    style_type = ParagraphStyle('TypeBadge', fontSize=9, textColor=type_color, fontName='Helvetica-Bold', spaceAfter=4, spaceBefore=0)
    style_title = ParagraphStyle('Title', fontSize=22, textColor=TEXT, fontName='Helvetica-Bold', spaceAfter=8, leading=28)
    style_meta = ParagraphStyle('Meta', fontSize=9, textColor=TEXT3, fontName='Helvetica', spaceAfter=4, leading=14)
    style_h1 = ParagraphStyle('H1', fontSize=16, textColor=TEXT, fontName='Helvetica-Bold', spaceBefore=16, spaceAfter=6, leading=20)
    style_h2 = ParagraphStyle('H2', fontSize=13, textColor=TEXT, fontName='Helvetica-Bold', spaceBefore=12, spaceAfter=5, leading=17)
    style_h3 = ParagraphStyle('H3', fontSize=11, textColor=TEXT2, fontName='Helvetica-Bold', spaceBefore=10, spaceAfter=4, leading=15)
    style_body = ParagraphStyle('Body', fontSize=10, textColor=TEXT, fontName='Helvetica', spaceAfter=8, leading=16)
    style_code = ParagraphStyle('Code', fontSize=8.5, textColor=CODE_FG, fontName='Courier', spaceAfter=0, leading=13, leftIndent=0)
    style_bullet = ParagraphStyle('Bullet', fontSize=10, textColor=TEXT, fontName='Helvetica', spaceAfter=4, leading=15, leftIndent=14, bulletIndent=4)
    style_quote = ParagraphStyle('Quote', fontSize=10, textColor=TEXT2, fontName='Helvetica-Oblique', spaceAfter=8, leading=16, leftIndent=16, borderPad=8)
    style_footer = ParagraphStyle('Footer', fontSize=8, textColor=TEXT3, fontName='Helvetica', alignment=TA_CENTER)

    story = []

    # Header bar - type badge
    story.append(Paragraph(type_label.upper(), style_type))
    story.append(Spacer(1, 2))

    # Title
    story.append(Paragraph(article.title, style_title))

    # Meta info
    author_name = article.author.name if article.author else 'Unknown'
    cat_name = article.category.name if article.category else 'Uncategorized'
    from datetime import datetime
    updated = article.updated_at.strftime('%B %d, %Y') if article.updated_at else '—'
    created = article.created_at.strftime('%B %d, %Y') if article.created_at else '—'

    story.append(Paragraph(f'<font color="#9b9189">Author:</font> {author_name} &nbsp;&nbsp; <font color="#9b9189">Category:</font> {cat_name} &nbsp;&nbsp; <font color="#9b9189">Version:</font> v{article.version} &nbsp;&nbsp; <font color="#9b9189">Updated:</font> {updated}', style_meta))

    if article.tags:
        tags_str = '  '.join([f'[{t.name}]' for t in article.tags])
        story.append(Paragraph(f'<font color="#9b9189">Tags:</font> {tags_str}', style_meta))

    story.append(HRFlowable(width='100%', thickness=1.5, color=ACCENT, spaceAfter=16, spaceBefore=6))

    # Parse and render markdown content
    if article.content:
        story.extend(parse_markdown_to_pdf(article.content, style_body, style_h1, style_h2, style_h3, style_code, style_bullet, style_quote))

    # Footer divider
    story.append(Spacer(1, 16))
    story.append(HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=8))
    story.append(Paragraph(f'QA Knowledge Base &nbsp;|&nbsp; Exported {datetime.now().strftime("%B %d, %Y")} &nbsp;|&nbsp; {article.title}', style_footer))

    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(TEXT3)
        canvas.drawRightString(A4[0] - 2.5*cm, 1.5*cm, f'Page {doc.page}')
        canvas.drawString(2.5*cm, 1.5*cm, 'QA Knowledge Base — Confidential')
        canvas.restoreState()

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    buffer.seek(0)
    return buffer

def parse_markdown_to_pdf(md, style_body, style_h1, style_h2, style_h3, style_code, style_bullet, style_quote):
    from reportlab.platypus import Preformatted, Table, TableStyle
    story = []
    lines = md.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]

        # Code block
        if line.strip().startswith('```'):
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code_lines.append(lines[i])
                i += 1
            code_text = '\n'.join(code_lines)
            # Code block as table with dark background
            code_para = Preformatted(code_text, style_code)
            t = Table([[code_para]], colWidths=[15.5*cm])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), CODE_BG),
                ('TOPPADDING', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                ('LEFTPADDING', (0,0), (-1,-1), 10),
                ('RIGHTPADDING', (0,0), (-1,-1), 10),
                ('ROUNDEDCORNERS', [4,4,4,4]),
            ]))
            story.append(Spacer(1, 4))
            story.append(t)
            story.append(Spacer(1, 8))
            i += 1
            continue

        # Headers
        if line.startswith('### '):
            story.append(Paragraph(clean_inline(line[4:]), style_h3))
        elif line.startswith('## '):
            story.append(Paragraph(clean_inline(line[3:]), style_h2))
        elif line.startswith('# '):
            story.append(Paragraph(clean_inline(line[2:]), style_h1))
        # Horizontal rule
        elif line.strip() == '---':
            story.append(HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceBefore=6, spaceAfter=6))
        # Blockquote
        elif line.startswith('> '):
            story.append(Paragraph(clean_inline(line[2:]), style_quote))
        # Bullet list
        elif re.match(r'^[\*\-] ', line):
            text = clean_inline(line[2:])
            story.append(Paragraph(f'• &nbsp;{text}', style_bullet))
        # Numbered list
        elif re.match(r'^\d+\. ', line):
            text = clean_inline(re.sub(r'^\d+\. ', '', line))
            num = re.match(r'^(\d+)\.', line).group(1)
            story.append(Paragraph(f'{num}. &nbsp;{text}', style_bullet))
        # Checkbox
        elif line.startswith('- [ ] ') or line.startswith('- [x] '):
            checked = '[x]' in line[:6]
            text = clean_inline(line[6:])
            mark = '☑' if checked else '☐'
            story.append(Paragraph(f'{mark} &nbsp;{text}', style_bullet))
        # Empty line
        elif line.strip() == '':
            story.append(Spacer(1, 4))
        # Regular paragraph
        else:
            story.append(Paragraph(clean_inline(line), style_body))

        i += 1

    return story

def clean_inline(text):
    """Convert inline markdown to ReportLab HTML-like markup"""
    # Escape special chars first
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    # Italic
    text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
    # Inline code
    text = re.sub(r'`([^`]+)`', r'<font name="Courier" size="9" color="#b5451b">\1</font>', text)
    # Links - just show the text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'<u>\1</u>', text)
    return text
