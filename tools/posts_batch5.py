# Peti talas članaka. Postojeći posts*.py se ne menjaju; ovde se samo spajaju novi delovi.
from posts_batch5_part1 import POSTS_5_PART1
from posts_batch5_part2 import POSTS_5_PART2
from posts_batch5_part3 import POSTS_5_PART3
from posts_batch5_part4 import POSTS_5_PART4
from posts_batch5_part5 import POSTS_5_PART5

POSTS_5 = POSTS_5_PART1 + POSTS_5_PART2 + POSTS_5_PART3 + POSTS_5_PART4 + POSTS_5_PART5

for _p in POSTS_5:
    _p.setdefault('date', '2026-11-05')
    _p.setdefault('date_sr', '5. novembra 2026.')
