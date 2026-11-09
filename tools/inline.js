// dist/bundle.js + css/style.css → play.html (서버 없이 더블클릭으로 열리는 한 파일 버전)
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync('css/style.css', 'utf8');
const js = readFileSync('dist/bundle.js', 'utf8').replaceAll('</script', '<\\/script');
// 경기장 모델(art/stadium/stadium.glb)은 더블클릭으로 열면 fetch로 못 읽으니 글자(base64)로 넣는다
const glb = readFileSync('art/stadium/stadium.glb').toString('base64');
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
<script>window.__STADIUM_GLB = '${glb}';</script>
<script>
${js}
</script>
</body>
</html>
`;
writeFileSync('play.html', html);
writeFileSync('version.txt', String(Date.now())); // index.html이 이 번호로 캐시를 건너뛴다
console.log(`play.html ${(html.length / 1024).toFixed(0)}KB`);
