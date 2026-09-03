@echo off
setlocal
cd /d "%~dp0android"
set "JAVA_HOME=%~dp0.android-toolchain\jdk\jdk-17.0.20.1+1"
set "ANDROID_HOME=%~dp0.android-toolchain\sdk"
set "GRADLE_USER_HOME=%~dp0.android-toolchain\gradle-home"
set "ANDROID_USER_HOME=%~dp0.android-toolchain\android-user-home"
set "GRADLE=%~dp0.android-toolchain\gradle\gradle-8.9\bin\gradle.bat"

if not exist "%GRADLE%" (
  echo Android build tools are missing.
  pause
  exit /b 1
)

call "%GRADLE%" --no-daemon assembleDebug
if errorlevel 1 (
  echo StoryVerse Debug APK build failed.
  pause
  exit /b 1
)

echo.
echo Debug APK created in:
echo %~dp0android\app\build\outputs\apk\debug
pause
