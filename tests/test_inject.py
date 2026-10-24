import sys
import unittest
from unittest.mock import patch


class TestClipboardSafety(unittest.TestCase):
    def test_has_non_text_clipboard(self):
        if sys.platform != "win32":
            self.skipTest("Windows-only test")

        from hush import inject_win

        with patch.object(inject_win.user32, "IsClipboardFormatAvailable", return_value=True):
            self.assertTrue(inject_win.has_non_text_clipboard())

        with patch.object(inject_win.user32, "IsClipboardFormatAvailable", return_value=False):
            self.assertFalse(inject_win.has_non_text_clipboard())

    def test_insert_avoids_paste_when_rich_media_present(self):
        if sys.platform != "win32":
            self.skipTest("Windows-only test")

        from hush import inject_win

        with patch("hush.inject_win.has_non_text_clipboard", return_value=True), \
             patch("hush.inject_win.type_text", return_value=True) as mock_type, \
             patch("hush.inject_win.paste_text", return_value=True) as mock_paste, \
             patch("hush.inject_win.foreground_injection_blocked", return_value=False), \
             patch("hush.inject_win.wait_modifiers_released", return_value=True):

            # Even if mode is 'paste', it should fall back to type_text to avoid wiping clipboard
            ok = inject_win.insert_text("Short text", mode="paste")
            self.assertTrue(ok)
            mock_type.assert_called_once()
            mock_paste.assert_not_called()


if __name__ == "__main__":
    unittest.main()
