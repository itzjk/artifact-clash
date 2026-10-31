Output docs/demo.gif
Require node
Set Shell "bash"
Set FontSize 16
Set Width 1240
Set Height 600
Set Padding 18
Set Framerate 5
Set Theme "Catppuccin Mocha"
Set TypingSpeed 12ms
Hide
Type "export PS1='$ '; clear"
Enter
Sleep 500ms
Type "node bin/artifact-clash.js check examples/constant.yml"
Enter
Wait+Screen@30s /Comparison: exact names; direct upload steps only./
Show
Sleep 6s
Hide
Type "clear"
Enter
Show
Type "node bin/artifact-clash.js check examples/os-only.yml"
Enter
Wait+Screen@30s /Comparison: exact names; direct upload steps only./
Sleep 5s
Hide
Type "clear"
Enter
Show
Type "node bin/artifact-clash.js check examples/unique.yml"
Enter
Wait+Screen@30s /No shared names in the supported subset./
Sleep 5s
