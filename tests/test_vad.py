import unittest
import numpy as np
from hush import vad


class TestVAD(unittest.TestCase):
    def test_silence_detection(self):
        # 1600 samples of pure silence (0.0)
        silence = np.zeros(1600, dtype=np.float32)
        self.assertFalse(vad.has_speech(silence))

    def test_white_noise_rejection(self):
        # White noise has flat spectrum (flatness close to 1.0)
        np.random.seed(42)
        noise = np.random.uniform(-0.05, 0.05, 16000).astype(np.float32)
        # Even with high amplitude, flatness should cause rejection
        self.assertFalse(vad.has_speech(noise))

    def test_voiced_formant_detection(self):
        # Synthetic voiced tone (sum of harmonics / non-flat spectrum)
        t = np.linspace(0, 1.0, 16000, dtype=np.float32)
        tone = (
            0.15 * np.sin(2 * np.pi * 220 * t) +
            0.10 * np.sin(2 * np.pi * 440 * t) +
            0.08 * np.sin(2 * np.pi * 880 * t)
        )
        self.assertTrue(vad.has_speech(tone))

    def test_sensitivity_thresholds(self):
        self.assertEqual(vad.resolve_threshold("high"), 0.005)
        self.assertEqual(vad.resolve_threshold("medium"), 0.010)
        self.assertEqual(vad.resolve_threshold("low"), 0.020)
        self.assertEqual(vad.resolve_threshold("unknown"), 0.010)

        # Quiet tone with RMS ~ 0.007
        t = np.linspace(0, 1.0, 16000, dtype=np.float32)
        quiet_tone = 0.01 * np.sin(2 * np.pi * 300 * t)
        # Passes under "high" sensitivity (threshold 0.005)
        self.assertTrue(vad.has_speech(quiet_tone, sensitivity="high"))
        # Rejected under "low" sensitivity (threshold 0.020)
        self.assertFalse(vad.has_speech(quiet_tone, sensitivity="low"))


if __name__ == "__main__":
    unittest.main()
