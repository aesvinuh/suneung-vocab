# Dock 앱 다시 만들기

`~/Applications/수능 단어.app`이 지워졌을 때 터미널에서:

```bash
cd suneung-vocab/mac
osacompile -o ~/Applications/"수능 단어.app" launcher.applescript
cp applet.icns ~/Applications/"수능 단어.app"/Contents/Resources/applet.icns
rm -f ~/Applications/"수능 단어.app"/Contents/Resources/Assets.car
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" ~/Applications/"수능 단어.app"/Contents/Info.plist
codesign --force --deep -s - ~/Applications/"수능 단어.app"
```

그다음 Finder에서 홈 → 응용 프로그램 → '수능 단어'를 Dock으로 끌어다 놓으면 됩니다.

크롬 프로필: 크롬은 프로필마다 저장 공간이 따로라서, 앱은 `launcher.applescript`의 `chromeProfile`("Default" = '내 Chrome')로 열린다.
다른 프로필로 바꾸려면 그 값을 `Profile 1` 등으로 고친 뒤 위 명령으로 다시 만든다
(프로필 폴더 이름은 크롬 주소창에 `chrome://version` → '프로필 경로'의 마지막 부분).
