"""dist-artifact/index.html을 Claude Artifact 페이지 형식(문서 뼈대 없이)으로 바꾼다."""
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf-8').read()
head = re.search(r'<head>(.*)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
# 뼈대가 charset·viewport를 넣으므로 뺀다.
head = re.sub(r'<meta charset[^>]*>\s*', '', head)
head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
title = re.search(r'<title>.*?</title>', head, re.S).group(0)
head = head.replace(title, '')
open(dst, 'w', encoding='utf-8').write(title + '\n' + head.strip() + '\n' + body.strip() + '\n')
