package main

import (
	"context"
	"errors"
	"net"
	"testing"
)

// withLookupMX swaps the package-level lookupMX for the duration of a test.
func withLookupMX(t *testing.T, fn func(context.Context, string) ([]*net.MX, error)) {
	t.Helper()
	prev := lookupMX
	lookupMX = fn
	t.Cleanup(func() { lookupMX = prev })
}

func TestCheckEmailDeliverable_Malformed(t *testing.T) {
	withLookupMX(t, func(context.Context, string) ([]*net.MX, error) {
		t.Fatal("lookupMX must not run for a malformed address")
		return nil, nil
	})
	if err := checkEmailDeliverable(context.Background(), "not-an-email"); !errors.Is(err, errEmailInvalid) {
		t.Fatalf("want errEmailInvalid, got %v", err)
	}
}

func TestCheckEmailDeliverable_NoMX(t *testing.T) {
	withLookupMX(t, func(context.Context, string) ([]*net.MX, error) { return nil, nil })
	if err := checkEmailDeliverable(context.Background(), "user@nope.example"); !errors.Is(err, errEmailUndeliverable) {
		t.Fatalf("want errEmailUndeliverable, got %v", err)
	}
}

func TestCheckEmailDeliverable_LookupError(t *testing.T) {
	withLookupMX(t, func(context.Context, string) ([]*net.MX, error) { return nil, errors.New("dns down") })
	if err := checkEmailDeliverable(context.Background(), "user@blip.example"); !errors.Is(err, errEmailUnverifiable) {
		t.Fatalf("want errEmailUnverifiable, got %v", err)
	}
}

func TestCheckEmailDeliverable_OK(t *testing.T) {
	withLookupMX(t, func(context.Context, string) ([]*net.MX, error) {
		return []*net.MX{{Host: "mx.example.", Pref: 10}}, nil
	})
	if err := checkEmailDeliverable(context.Background(), "User@Example.com"); err != nil {
		t.Fatalf("want nil, got %v", err)
	}
}
