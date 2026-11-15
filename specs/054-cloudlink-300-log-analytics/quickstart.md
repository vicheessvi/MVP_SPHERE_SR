# Verification

1. Run `node tests.js` and `python -m unittest discover -s python_tests`.
2. Open the tool, import current SR and a folder of XML logs; inspect source-match/format status.
3. Check the Bar 300 unknown starts, confirmed normal web shutdown and start after it, and low-confidence power gaps. No reboot is confirmed without a validated distinguishing action marker.
4. Reimport the same folder and check that counts and donut denominator do not change.
5. Confirm validated Box 300/600 observations enter the same duration donut and heatmap while preserving separate model labels, exact SR matching and source references.
