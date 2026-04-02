/// Convert a byte offset in source text to (line, column), both 1-based.
pub fn offset_to_line_column(source: &str, offset: usize) -> (u32, u32) {
    let mut line = 1u32;
    let mut col = 1u32;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offset_zero_returns_first_position() {
        assert_eq!(offset_to_line_column("hello", 0), (1, 1));
    }

    #[test]
    fn offset_within_first_line() {
        assert_eq!(offset_to_line_column("hello", 3), (1, 4));
    }

    #[test]
    fn offset_at_start_of_second_line() {
        // "ab\ncd" — offset 3 is 'c', which is line 2, col 1
        assert_eq!(offset_to_line_column("ab\ncd", 3), (2, 1));
    }

    #[test]
    fn offset_within_second_line() {
        // "ab\ncd" — offset 4 is 'd', line 2 col 2
        assert_eq!(offset_to_line_column("ab\ncd", 4), (2, 2));
    }

    #[test]
    fn offset_at_newline_char() {
        // "ab\ncd" — offset 2 is '\n', line 1 col 3
        assert_eq!(offset_to_line_column("ab\ncd", 2), (1, 3));
    }

    #[test]
    fn multiple_newlines() {
        // "a\nb\nc" — offset 4 is 'c', line 3 col 1
        assert_eq!(offset_to_line_column("a\nb\nc", 4), (3, 1));
    }

    #[test]
    fn offset_beyond_source_length() {
        // offset past end — iterates all chars then returns final position
        assert_eq!(offset_to_line_column("ab", 10), (1, 3));
    }

    #[test]
    fn empty_source_offset_zero() {
        assert_eq!(offset_to_line_column("", 0), (1, 1));
    }

    #[test]
    fn empty_source_offset_nonzero() {
        assert_eq!(offset_to_line_column("", 5), (1, 1));
    }

    #[test]
    fn consecutive_newlines() {
        // "\n\n" — offset 1 is second '\n', line 2 col 1
        assert_eq!(offset_to_line_column("\n\n", 1), (2, 1));
    }

    #[test]
    fn offset_at_end_of_source() {
        // "abc" len=3, offset 3 — past last char
        assert_eq!(offset_to_line_column("abc", 3), (1, 4));
    }
}
