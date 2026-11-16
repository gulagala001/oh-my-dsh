"""Start the vendored MIT CPython kernel, without installing a package."""
from pathlib import Path
import sys

if sys.version_info < (3, 11):
    raise SystemExit("dsh-unharnessed requires Python 3.11 or newer")
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vendor"))
from rlm.repl import main
main()
