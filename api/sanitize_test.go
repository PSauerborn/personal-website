package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestSanitizeText tests the free-text sanitizer across whitespace, casing and
// unicode inputs, asserts that only the first letter of each word is changed so
// that interior capitals such as "McLovin" survive, and asserts that applying it
// twice changes nothing (REQ-5.3).
func TestSanitizeText(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{name: "leading and trailing whitespace", input: "  john   smith  ", expected: "John Smith"},
		{name: "leading whitespace only", input: "   john", expected: "John"},
		{name: "trailing whitespace only", input: "john   ", expected: "John"},
		{name: "multiple internal spaces", input: "john      smith", expected: "John Smith"},
		{name: "tabs and newlines", input: "\tjohn\n\r\vsmith\f", expected: "John Smith"},
		{name: "mixed case is capitalized without lower-casing the rest", input: "jOHN sMITh", expected: "JOHN SMITh"},
		{name: "upper case is preserved", input: "JOHN SMITH", expected: "JOHN SMITH"},
		{name: "interior capital is preserved", input: "Test McLovin", expected: "Test McLovin"},
		{name: "lower case name is capitalized per word", input: "test mclovin", expected: "Test Mclovin"},
		{name: "interior capital survives whitespace normalization", input: "  Test   McLovin  ", expected: "Test McLovin"},
		{name: "organization is capitalized per word", input: "acme corp", expected: "Acme Corp"},
		{name: "single word", input: "john", expected: "John"},
		{name: "multi word", input: "john ronald reuel tolkien", expected: "John Ronald Reuel Tolkien"},
		{name: "unicode input", input: "  éMILIE   du   châtelet ", expected: "ÉMILIE Du Châtelet"},
		{name: "non latin unicode input", input: "  борис   ельцин ", expected: "Борис Ельцин"},
		{name: "non cased script is preserved", input: " 東京  タワー ", expected: "東京 タワー"},
		{name: "empty string", input: "", expected: ""},
		{name: "whitespace only", input: "   \t\n ", expected: ""},
		{name: "already clean input", input: "John Smith", expected: "John Smith"},
		{name: "punctuated organization", input: "  acme   corp.   (uk)  ", expected: "Acme Corp. (uk)"},
		{name: "digits are untouched", input: " 3m  company ", expected: "3m Company"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, SanitizeText(testCase.input))
		})
	}

	t.Run("is idempotent", func(t *testing.T) {
		for _, testCase := range cases {
			once := SanitizeText(testCase.input)
			assert.Equal(t, once, SanitizeText(once))
		}
	})
}

// TestSanitizeEmail tests that email addresses are trimmed and lower-cased so
// that contacts are not duplicated over casing or spacing differences, and that
// applying the sanitizer twice changes nothing (REQ-5.2, REQ-5.3).
func TestSanitizeEmail(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{name: "mixed case with surrounding whitespace", input: "  John.Smith@Example.COM ", expected: "john.smith@example.com"},
		{name: "upper case", input: "JOHN.SMITH@EXAMPLE.COM", expected: "john.smith@example.com"},
		{name: "tabs and newlines are trimmed", input: "\tjohn@example.com\n", expected: "john@example.com"},
		{name: "already normalized", input: "john@example.com", expected: "john@example.com"},
		{name: "empty string", input: "", expected: ""},
		{name: "whitespace only", input: "   ", expected: ""},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, SanitizeEmail(testCase.input))
		})
	}

	t.Run("is idempotent", func(t *testing.T) {
		for _, testCase := range cases {
			once := SanitizeEmail(testCase.input)
			assert.Equal(t, once, SanitizeEmail(once))
		}
	})
}

// TestIsEmpty tests the emptiness predicate applied to the required request
// fields, covering the empty string and inputs consisting only of whitespace.
func TestIsEmpty(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected bool
	}{
		{name: "empty string", input: "", expected: true},
		{name: "spaces only", input: "     ", expected: true},
		{name: "tabs and newlines only", input: "\t\n\r ", expected: true},
		{name: "non breaking whitespace only", input: "  ", expected: true},
		{name: "padded content", input: "   a   ", expected: false},
		{name: "content", input: "hello", expected: false},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, IsEmpty(testCase.input))
		})
	}
}

// TestIsValidEmail tests the email predicate against valid and invalid
// addresses, including an address longer than the email column width, which must
// be rejected before it can reach the database (REQ-5.6).
func TestIsValidEmail(t *testing.T) {
	valid := []string{
		"john@example.com",
		"john.smith@example.com",
		"john.smith@example.co.uk",
		"john+tag@example.com",
		"john_smith@example.com",
		"john-smith@sub.domain.example.com",
		"j@e.io",
		"john%smith@example.com",
		"1234567890@example.com",
	}

	for _, address := range valid {
		t.Run("valid: "+address, func(t *testing.T) {
			assert.True(t, IsValidEmail(address))
		})
	}

	invalid := []string{
		"",
		"   ",
		"john",
		"john@",
		"@example.com",
		"john@@example.com",
		"john@example",
		"john@.com",
		"john@example..com",
		"john@-example.com",
		"john@example-.com",
		"john smith@example.com",
		"john@exam ple.com",
		"john@example.com ",
		" john@example.com",
		"john@example.c0m",
		"john\n@example.com",
		"john@example.com\n",
	}

	for _, address := range invalid {
		t.Run("invalid: "+address, func(t *testing.T) {
			assert.False(t, IsValidEmail(address))
		})
	}

	t.Run("rejects an address longer than the email column width", func(t *testing.T) {
		address := strings.Repeat("a", ContactEmailMaxLength) + "@example.com"
		assert.False(t, WithinLength(address, ContactEmailMaxLength))
	})
}

// TestWithinLength tests the length predicate at, below and above its limit, and
// asserts that the length is counted in runes rather than in bytes so that a
// multi-byte input is not rejected on its byte count.
func TestWithinLength(t *testing.T) {
	limits := []struct {
		name  string
		limit int
	}{
		{name: "contact name", limit: ContactNameMaxLength},
		{name: "contact organization", limit: ContactOrganizationMaxLength},
		{name: "contact email", limit: ContactEmailMaxLength},
		{name: "comment author", limit: CommentAuthorMaxLength},
		{name: "comment", limit: CommentMaxLength},
		{name: "message", limit: MessageMaxLength},
	}

	for _, entry := range limits {
		t.Run(entry.name+": one below the limit", func(t *testing.T) {
			assert.True(t, WithinLength(strings.Repeat("a", entry.limit-1), entry.limit))
		})

		t.Run(entry.name+": exactly at the limit", func(t *testing.T) {
			assert.True(t, WithinLength(strings.Repeat("a", entry.limit), entry.limit))
		})

		t.Run(entry.name+": one above the limit", func(t *testing.T) {
			assert.False(t, WithinLength(strings.Repeat("a", entry.limit+1), entry.limit))
		})
	}

	t.Run("empty string is within any limit", func(t *testing.T) {
		assert.True(t, WithinLength("", 1))
	})

	t.Run("length is counted in runes and not bytes", func(t *testing.T) {
		// each character is a multi-byte rune, so a byte count would reject this input
		assert.True(t, WithinLength(strings.Repeat("é", 10), 10))
		assert.False(t, WithinLength(strings.Repeat("é", 11), 10))
	})
}

// TestColumnWidths tests that the length limits applied by this file match the
// documented database column widths, and that the free-text fields persisted
// into unbounded TEXT columns are bounded as well (REQ-5.6).
func TestColumnWidths(t *testing.T) {
	t.Run("widths match the documented database column widths", func(t *testing.T) {
		assert.Equal(t, 255, ContactNameMaxLength)
		assert.Equal(t, 255, ContactOrganizationMaxLength)
		assert.Equal(t, 320, ContactEmailMaxLength)
		assert.Equal(t, 255, CommentAuthorMaxLength)
	})

	t.Run("bounds the free-text fields persisted into unbounded TEXT columns", func(t *testing.T) {
		// base.article_comment.comment and base.message.content are TEXT, so
		// their bounds are application policy rather than column widths; they
		// must still be finite, so that neither the process memory nor the stored
		// row size is unbounded (RISK-004).
		for _, limit := range []int{CommentMaxLength, MessageMaxLength} {
			assert.Positive(t, limit)
			assert.LessOrEqual(t, limit, 1<<16)
		}
	})
}
