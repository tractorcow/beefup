.PHONY: help install build test typecheck clean

PNPM := pnpm

help:
	@printf '%s\n' \
		'Targets:' \
		'  make install    Install pinned dependencies (frozen lockfile)' \
		'  make build      Compile TypeScript to dist/' \
		'  make test       Run unit tests' \
		'  make typecheck  Typecheck without emitting' \
		'  make clean      Remove dist/'

install:
	$(PNPM) install --frozen-lockfile

build:
	$(PNPM) run build

test:
	$(PNPM) test

typecheck:
	$(PNPM) exec tsc --noEmit

clean:
	rm -rf dist
