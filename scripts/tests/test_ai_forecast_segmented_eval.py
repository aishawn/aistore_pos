import unittest

from scripts.ai_forecast_segmented_eval import fold_stability, summarize


class SegmentedForecastStabilityTests(unittest.TestCase):
    def test_fold_stability_reports_coverage_dispersion_and_paired_wins(self):
        model_rows = [
            {"evaluationStart": "2026-01-01", "weightedWape": 0.5, "biasRatio": 0.1},
            {"evaluationStart": "2026-01-08", "weightedWape": 1.5, "biasRatio": -0.2},
        ]
        baseline_rows = [
            {"evaluationStart": "2026-01-01", "weightedWape": 0.75},
            {"evaluationStart": "2026-01-08", "weightedWape": 1.25},
        ]

        result = fold_stability(model_rows, baseline_rows)

        self.assertEqual(2, result["foldCount"])
        self.assertEqual(2, result["scoredFoldCount"])
        self.assertEqual(1.0, result["wapeMedian"])
        self.assertEqual(0.75, result["wapeP25"])
        self.assertEqual(1.25, result["wapeP75"])
        self.assertEqual(0.5, result["wapeStdDev"])
        self.assertEqual(1, result["beatBaselineFoldCount"])
        self.assertEqual(0.5, result["beatBaselineFoldRate"])
        self.assertAlmostEqual(0.0666666666666667,
                               result["medianRelativeImprovementVsBaseline"])

    def test_summary_keeps_prediction_coverage_distinct_from_unique_products(self):
        metrics = {
            "products": {1, 2}, "productWindows": 3, "observedDays": 21,
            "actualUnits": 42.0, "absoluteError": 10.5, "signedError": -2.0,
            "maseNumerator": 7.0, "maseDenominator": 14.0,
            "p80CoveredDays": 17, "p90CoveredDays": 20,
            "lowConfidenceWindows": 1, "safetyViolations": 0,
            "expectedProductWindows": 4,
        }

        result = summarize(metrics, expected_product_windows=4)

        self.assertEqual(2, result["productCount"])
        self.assertEqual(3, result["productWindows"])
        self.assertEqual(0.75, result["predictionCoverage"])
        self.assertEqual(0.25, result["weightedWape"])
        self.assertEqual(-2 / 42, result["biasRatio"])
        self.assertEqual(0.5, result["mase"])
        self.assertEqual(17 / 21, result["p80Coverage"])
        self.assertEqual(20 / 21, result["p90Coverage"])
        self.assertEqual(0, result["predictionSafetyViolations"])


if __name__ == "__main__":
    unittest.main()
