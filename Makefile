.PHONY: help install build test typecheck clean install-global uninstall-global

PNPM := pnpm

help:
	@printf '%s\n' \
		'Targets:' \
		'  make install            Install pinned dependencies (frozen lockfile)' \
		'  make build              Compile TypeScript to dist/' \
		'  make test               Run unit tests' \
		'  make typecheck          Typecheck without emitting' \
		'  make install-global     Build and install the beefup command globally' \
		'  make uninstall-global   Remove the global beefup command' \
		'  make clean              Remove dist/'

install:
	$(PNPM) install --frozen-lockfile

build:
	$(PNPM) run build

test:
	$(PNPM) test

typecheck:
	$(PNPM) exec tsc --noEmit

install-global: build
	$(PNPM) add --global "$(CURDIR)"

uninstall-global:
	-$(PNPM) remove --global @tractorcow/beefup
	-$(PNPM) remove --global beefup

clean:
	rm -rf dist
