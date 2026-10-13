# Makefile for SuperAgent macOS Dedicated UI (SwiftUI Native)

.PHONY: all build test run clean xcode help

all: build

build:
	swift build

test:
	swift test

run:
	swift run SuperAgent

clean:
	swift package clean

xcode:
	open -a Xcode Package.swift

help:
	@echo "SuperAgent macOS Client Targets:"
	@echo "  make build  - Compile the Swift package executable"
	@echo "  make test   - Run unit test suite (XCTest)"
	@echo "  make run    - Launch SuperAgent native macOS client"
	@echo "  make xcode  - Open project in Xcode"
	@echo "  make clean  - Clean SwiftPM build artifacts"
