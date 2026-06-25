.PHONY: setup validate test build clean

PY ?= python

setup:        ## install the package and dev deps
	$(PY) -m pip install -e ".[dev]"

validate:     ## validate every regulation record (CI gate)
	$(PY) -m ai_reg_tracker.validate

test:         ## run the test suite
	$(PY) -m pytest -q

build: validate  ## render all dist/ outputs
	$(PY) -m ai_reg_tracker.build_json
	$(PY) -m ai_reg_tracker.build_xlsx
	$(PY) -m ai_reg_tracker.build_changelog

clean:
	rm -rf dist
