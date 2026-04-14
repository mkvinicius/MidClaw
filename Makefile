.PHONY: install install-ts install-py dev test vault-test brain-test clean

install: install-ts install-py

install-ts:
	npm install

install-py:
	uv sync

dev:
	npm run dev

vault-test:
	npm run vault:test

brain-test:
	python brain/agent.py "Hello, what is MidClaw?"

test: vault-test brain-test

clean:
	rm -rf dist node_modules __pycache__ .venv
