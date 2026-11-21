# Installs each debug APK on the emulator, opens it, checks the screen rendered, logs crashes.
import subprocess, time, re, sys, os
os.makedirs('shots', exist_ok=True)
def sh(c, check=False): r = subprocess.run(c, shell=True, capture_output=True, text=True); print('$', c, '\n', (r.stdout + r.stderr)[-600:]); return r.stdout
def dump():
    sh('adb shell uiautomator dump /sdcard/ui.xml'); return sh('adb shell cat /sdcard/ui.xml')
def find(xml, pat):
    for m in re.finditer(r'<node [^>]*?(?:text|content-desc)="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml):
        if re.search(pat, m.group(1)): x1,y1,x2,y2 = map(int, m.groups()[1:]); return ((x1+x2)//2, (y1+y2)//2)
    return None
def edits(xml):
    out=[]
    for m in re.finditer(r'<node [^>]*?class="android.widget.EditText"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml):
        x1,y1,x2,y2 = map(int, m.groups()); out.append(((x1+x2)//2,(y1+y2)//2))
    return out
ok = True
for app, pkg in [('Customer', 'com.janahalriyadah.store.debug'), ('Owner', 'com.janahalriyadah.owner.debug')]:
    sh('adb logcat -c')
    sh(f'adb install -r out/Janah-{app}-debug.apk')
    sh(f'adb shell am start -W -n {pkg}/com.janahalriyadah.app.MainActivity')
    time.sleep(20)
    sh(f'adb exec-out screencap -p > shots/{app}-1-start.png')
    x = dump(); open(f'shots/{app}-ui.xml','w').write(x)
    found = bool(re.search(r'جناح|Janah|المالك|Owner', x))
    print(f'### {app}: app text on screen = {found}')
    if app == 'Customer':
        p = find(x, r'English|العربية')
        if p: sh(f'adb shell input tap {p[0]} {p[1]}'); time.sleep(3); sh(f'adb exec-out screencap -p > shots/{app}-2-lang.png')
        p = find(dump(), r'Add to cart|أضف إلى السلة')
        if p: sh(f'adb shell input tap {p[0]} {p[1]}'); time.sleep(2); sh(f'adb exec-out screencap -p > shots/{app}-3-added.png')
    else:
        e = edits(x)
        if len(e) >= 2:
            sh(f'adb shell input tap {e[1][0]} {e[1][1]}'); time.sleep(1); sh('adb shell input text demo1234'); sh('adb shell input keyevent 66'); time.sleep(6)
            sh(f'adb exec-out screencap -p > shots/{app}-2-dashboard.png')
            d = dump(); print(f'### Owner dashboard visible = {bool(re.search("لوحة التحكم|Dashboard|مبيعات اليوم", d))}')
    log = sh('adb logcat -d -v brief')
    open(f'shots/{app}-logcat.txt','w').write(log)
    crash = re.findall(r'FATAL EXCEPTION.*', log)
    jserr = re.findall(r'.*(?:chromium|Console|cr_|WebView).*', log)
    texts = re.findall(r'text="([^"]+)"', x)
    print(f'### {app}: ui texts:', texts[:25])
    print(f'### {app}: crashes={len(crash)} js_errors={len(jserr)}'); [print('   ', c) for c in (crash + jserr)[:40]]
    if crash or not found: ok = False
print('### RESULT', 'PASS' if ok else 'FAIL')
