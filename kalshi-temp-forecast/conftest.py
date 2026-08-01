"""Make the project modules importable from tests.

pytest inserts the directory containing this file (the project root) at the front
of sys.path, so ``import ktf`` and ``import data_pipeline`` resolve when running
``pytest`` from anywhere.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
