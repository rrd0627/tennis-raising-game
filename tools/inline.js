// dist/bundle.js + css/style.css → play.html (서버 없이 더블클릭으로 열리는 한 파일 버전)
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync('css/style.css', 'utf8');
const js = readFileSync('dist/bundle.js', 'utf8').replaceAll('</script', '<\\/script');
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>테니스 선수 키우기</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@400;600;700;800&display=swap">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>
${js}
</script>
</body>
</html>
`;
writeFileSync('play.html', html);
console.log(`play.html ${(html.length / 1024).toFixed(0)}KB`);
