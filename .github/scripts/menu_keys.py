# Drives `node lab.mjs` in a real console (ConPTY on Windows, pty elsewhere) and presses keys like a person:
# arrows in the menu, a step, the pause, back to the menu, arrows again. Fails if the selection doesn't move.
import os, re, sys, time, threading

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07")
buf = []
lock = threading.Lock()

if os.name == "nt":
    from winpty import PtyProcess
    proc = PtyProcess.spawn("node lab.mjs", dimensions=(36, 120))
    write = proc.write
    def reader():
        while True:
            try: s = proc.read(4096)
            except EOFError: return
            with lock: buf.append(s)
else:
    import pty, fcntl, termios, struct
    pid, fd = pty.fork()
    if pid == 0: os.execvp("node", ["node", "lab.mjs"])
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 36, 120, 0, 0))
    write = lambda s: os.write(fd, s.encode())
    def reader():
        while True:
            try: s = os.read(fd, 4096).decode("utf8", "replace")
            except OSError: return
            if not s: return
            with lock: buf.append(s)
threading.Thread(target=reader, daemon=True).start()

def screen_since(mark):
    with lock: return ANSI.sub("", "".join(buf)[mark:])
def mark():
    with lock: return len("".join(buf))
def wait_for(pattern, since, timeout=20):
    t = time.time()
    while time.time() - t < timeout:
        if re.search(pattern, screen_since(since)): return True
        time.sleep(0.1)
    print("TIMEOUT waiting for", pattern, "\n--- screen ---\n", screen_since(since)[-2000:]); return False

ok = True
def check(name, cond):
    global ok; ok &= bool(cond); print(("PASS " if cond else "FAIL ") + name, flush=True)

DOWN, UP = "\x1b[B", "\x1b[A"
m = mark(); check("menu shows", wait_for(r"STEP 1 OF 8", m))
m = mark(); write(DOWN); check("down arrow moves to step 2", wait_for(r"STEP 2 OF 8", m, 5))
m = mark(); write(DOWN); check("down arrow moves to step 3", wait_for(r"STEP 3 OF 8", m, 5))
m = mark(); write(UP); check("up arrow moves back to step 2", wait_for(r"STEP 2 OF 8", m, 5))
m = mark(); write("8"); check("digit 8 jumps to step 8", wait_for(r"STEP 8 OF 8", m, 5))
# run step 3 (Read the task), leave it, pass the pause, then the arrows must still work
m = mark(); write("3"); time.sleep(0.3); write("\r"); check("step 3 starts", wait_for(r"step 3 of 8", m, 15))
time.sleep(2); m = mark(); write("\r"); check("pause appears", wait_for(r"back to your lab", m, 15))
time.sleep(0.5); m = mark(); write("\r"); check("menu is back", wait_for(r"STEP \d OF 8", m, 10))
for i in range(2):
    m = mark(); write(DOWN); check(f"after a step: down arrow #{i+1} moves", wait_for(r"STEP \d OF 8", m, 5))
m = mark(); write("7"); check("after a step: digit 7 jumps", wait_for(r"STEP 7 OF 8", m, 5))
m = mark(); write(DOWN); check("after a step: down from 7 reaches 8", wait_for(r"STEP 8 OF 8", m, 5))
write("q"); time.sleep(1)
sys.exit(0 if ok else 1)
