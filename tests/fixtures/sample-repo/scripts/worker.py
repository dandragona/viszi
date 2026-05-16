from src.db import db


def consume_queue():
    db.query("select 1")


class Worker:
    def run(self):
        consume_queue()
