package main

import (
	"regexp"
	"strings"
	"unicode"
)

// Maximum lengths of the free-text fields accepted by the API, expressed in
// characters. The bounded columns mirror the widths of the database columns the
// values are persisted into (see docs/db_schema.md); the fields persisted into
// unbounded TEXT columns carry an explicit policy limit instead, so that every
// free-text field accepted by an unauthenticated endpoint has an upper bound.
// Callers pass the relevant limit to WithinLength explicitly.
const (
	// ContactNameMaxLength mirrors base.contact.name VARCHAR(255)
	ContactNameMaxLength = 255
	// ContactOrganizationMaxLength mirrors base.contact.organization VARCHAR(255)
	ContactOrganizationMaxLength = 255
	// ContactEmailMaxLength mirrors base.contact.email VARCHAR(320)
	ContactEmailMaxLength = 320
	// CommentAuthorMaxLength mirrors base.article_comment.author VARCHAR(255)
	CommentAuthorMaxLength = 255
	// CommentMaxLength bounds base.article_comment.comment. The column is TEXT
	// and therefore unbounded, so this limit is application policy rather than a
	// column width: the endpoint writing it is unauthenticated, and without an
	// upper bound a single caller could grow the table without limit (RISK-004).
	CommentMaxLength = 4096
	// MessageMaxLength bounds base.message.content, which is TEXT and therefore
	// unbounded, for the same reason as CommentMaxLength. It is the more generous
	// of the two, since a contact message carries the whole enquiry rather than a
	// remark on an article.
	MessageMaxLength = 8192
)

// emailPattern is the explicit email validation regex used by IsValidEmail. The
// local part accepts the unquoted atom characters permitted by RFC 5322, and the
// domain must consist of at least two dot-separated labels, each starting and
// ending with an alphanumeric character and containing only alphanumerics and
// hyphens. The final label (the TLD) must be alphabetic. The pattern is anchored
// so that surrounding whitespace or embedded newlines are rejected.
var emailPattern = regexp.MustCompile(
	`^[a-zA-Z0-9!#$%&'*+/=?^_` + "`" + `{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_` + "`" + `{|}~-]+)*` +
		`@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$`,
)

// SanitizeText applies the single shared sanitization rule used for every
// free-text identity field accepted by the API: leading and trailing whitespace
// is trimmed, runs of internal whitespace are collapsed to a single space, and
// the first letter of each word is capitalized while the remainder of the word
// is left exactly as submitted, so that names such as "Test McLovin" keep their
// interior capitals. It is used for contact names and organizations (REQ-5.3) and
// for comment authors (REQ-3.5); there are deliberately no per-domain variants.
// The function is pure and idempotent: SanitizeText(SanitizeText(v)) always
// equals SanitizeText(v). It returns the sanitized value, which is the empty
// string for empty or whitespace-only input.
func SanitizeText(value string) string {
	words := strings.Fields(value)
	for index, word := range words {
		words[index] = capitalize(word)
	}
	return strings.Join(words, " ")
}

// capitalize upper-cases the first rune of the given word and leaves every
// remaining rune untouched, so that interior capitalization such as "McLovin"
// survives. Runes belonging to scripts without case (digits, punctuation, CJK
// characters) are returned unchanged. It returns the capitalized word.
func capitalize(word string) string {
	runes := []rune(word)
	if len(runes) == 0 {
		return ""
	}
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

// SanitizeEmail normalizes an email address by trimming leading and trailing
// whitespace and converting the address to lower case, so that contacts are not
// duplicated because of casing differences (REQ-5.3). It returns the normalized
// address, which is the empty string for empty or whitespace-only input.
func SanitizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// IsEmpty reports whether the given value is empty once leading and trailing
// whitespace has been trimmed, so that whitespace-only input counts as empty.
// It returns true when the trimmed value contains no characters.
func IsEmpty(value string) bool {
	return strings.TrimSpace(value) == ""
}

// IsValidEmail reports whether the given value is a syntactically valid email
// address according to the explicit emailPattern regex (REQ-5.6). The value is
// matched as given, so callers should normalize it with SanitizeEmail first. It
// returns true when the address matches the pattern.
func IsValidEmail(value string) bool {
	return emailPattern.MatchString(value)
}

// WithinLength reports whether the given value fits into a database column of
// the given width. Lengths are counted in characters rather than bytes, matching
// PostgreSQL VARCHAR semantics, and callers pass the column width explicitly
// (for example ContactNameMaxLength). It returns true when the value is at most
// limit characters long.
func WithinLength(value string, limit int) bool {
	return len([]rune(value)) <= limit
}
