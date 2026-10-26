# -*- coding: utf-8 -*-
"""把 book/parts/ 下的片段拼成单文件 HTML。"""
import io, os
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
# 可用环境变量 SHIGUANG_OUT 指定输出路径（GitHub Pages 仓库里会输出成 index.html）
OUT = os.environ.get('SHIGUANG_OUT') or os.path.join(os.path.dirname(HERE), '史高治账本.html')
OUT = os.path.abspath(OUT)

HTML_PARTS = ['01-head.html', '03-body.html']
JS_PARTS = ['04-core.js', '05-charts.js', '06-import.js', '07-views.js', '09-xlsx.js', '08-events.js']

# 史高治金币：外圈金环 + 内圈压纹 + 一枚小小的 "¢"
COIN_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#fbe38b"/><stop offset=".55" stop-color="#efc24a"/>'
    '<stop offset="1" stop-color="#b8871d"/></linearGradient></defs>'
    '<circle cx="32" cy="32" r="31" fill="url(#g)"/>'
    '<circle cx="32" cy="32" r="31" fill="none" stroke="#8a6410" stroke-opacity=".45" stroke-width="2"/>'
    '<circle cx="32" cy="32" r="23" fill="none" stroke="#8a6410" stroke-opacity=".38" stroke-width="2"/>'
    '<text x="32" y="43" font-family="Georgia,serif" font-size="28" font-weight="700" '
    'text-anchor="middle" fill="#6b4a08" fill-opacity=".8">¢</text>'
    '</svg>'
)


def read(name):
    p = os.path.join(HERE, 'parts', name)
    return io.open(p, encoding='utf-8').read()


def main():
    head = read('01-head.html')
    style = read('02-style.css')
    body = read('03-body.html')
    js = '\n\n'.join(read(p) for p in JS_PARTS)

    fav = '<link rel="icon" href="data:image/svg+xml,' + quote(COIN_SVG, safe='') + '">'

    head = head.replace('<!--FAVICON-->', fav)
    head = head.replace('<!--STYLE-->', '<style>\n' + style + '\n</style>')
    head = head.replace('<!--BODY-->', body)
    head = head.replace('<!--SCRIPT-->', '<script>\n' + js + '\n</script>')

    # 自检：不允许残留占位符
    for ph in ('<!--FAVICON-->', '<!--STYLE-->', '<!--BODY-->', '<!--SCRIPT-->'):
        assert ph not in head, 'unreplaced ' + ph

    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(head)
    size = os.path.getsize(OUT)
    print('built %s  %.1f KB' % (os.path.basename(OUT), size / 1024.0))


if __name__ == '__main__':
    main()
