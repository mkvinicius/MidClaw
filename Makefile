.PHONY: install install-ts install-py build dev test vault-test brain-test sim-test guard-test clean docker-build docker-up

install: install-ts install-py

install-ts:
	npm install

install-py:
	uv sync

build:
	npm run build

dev:
	npm run dev

vault-test:
	npm run vault:test

brain-test:
	python brain/agent.py "Hello, what is MidClaw?"

sim-test:
	python sim/cli.py --actor generic-ransomware --scenario "Test simulation" --steps 3 --output summary

guard-test:
	npx tsx src/index.ts guard

status:
	npx tsx src/index.ts status

bridge:
	python brain/bridge.py

sim:
	python sim/cli.py $(ARGS)

seed:
	npx tsx src/index.ts vault:seed

test: vault-test

clean:
	rm -rf dist node_modules __pycache__ .venv

docker-build:
	docker build -t midclaw:latest .

docker-up:
	docker-compose up -d
