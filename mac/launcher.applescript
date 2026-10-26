-- 수능 단어 앱을 크롬 '앱 창'(주소창·탭 없음)으로 연다. 크롬이 없으면 기본 브라우저로.
set appURL to "https://aesvinuh.github.io/suneung-vocab/"
set chromePath to "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
try
	do shell script "test -x " & quoted form of chromePath
	do shell script quoted form of chromePath & " --app=" & quoted form of appURL & " > /dev/null 2>&1 &"
on error
	open location appURL
end try
