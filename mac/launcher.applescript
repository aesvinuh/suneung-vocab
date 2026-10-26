-- 수능 단어 앱을 크롬 '앱 창'(주소창·탭 없음)으로 연다. 크롬이 없으면 기본 브라우저로.
-- 크롬 프로필마다 저장 공간이 따로라서, 단어가 들어 있는 프로필(Default = '내 Chrome')로 고정한다.
set appURL to "https://aesvinuh.github.io/suneung-vocab/"
set chromePath to "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
set chromeProfile to "Default"
try
	do shell script "test -x " & quoted form of chromePath
	do shell script quoted form of chromePath & " --profile-directory=" & quoted form of chromeProfile & " --app=" & quoted form of appURL & " > /dev/null 2>&1 &"
on error
	open location appURL
end try
