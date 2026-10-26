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
