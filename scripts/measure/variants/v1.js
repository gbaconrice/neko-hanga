function TIME_FIT(n){return n<35?2.4:n<60?2.4-(n-35)*.4/25:Math.max(1.5,2.0-(n-60)*.5/30)}
