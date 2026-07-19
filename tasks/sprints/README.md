# Sprint Plans

Identity Plugin Live MAX Identity Bot реализуется через спринты.

## Structure

Каждый спринт описывает задачи для конкретного этапа разработки:

- `sprint-00.md` — API Source And Contract
- `sprint-01.md` — Live Boundaries
- `sprint-02.md` — Live Inbound
- `sprint-03.md` — Runtime And Operations
- `sprint-04.md` — Live Acceptance
- `sprint-05.md` — Follow-up after live diagnosis
- `sprint-06.md` — Convention-Based Plugin Loader
- `sprint-07.md` — Identity Plugin Live Plan (master plan for sprints 0-4)
- `sprint-08.md` — ADR-0013 Safe Logger TDD
- `sprint-09.md` — ADR-0014 Async HTTP Error Paths TDD
- `sprint-10.md` — ADR-0015 Zero Dependencies Policy Test
- `sprint-11.md` — ADR-0016 DI Injection Audit Test
- `sprint-12.md` — ADR-0017 Event Contract Edge Cases
- `sprint-13.md` — Bot Commands System
- `sprint-14.md` — ADR-0025/0028 Queue Infrastructure (delivery queue)
- `sprint-15.md` — ADR-0023/0024 Ingress Pipeline (HTTP + JWT auth + normalizers)
- `sprint-16.md` — App Wiring + Integration (multi-source ingest end-to-end)
- `sprint-17.md` — ADR-0029 Lifecycle Audit Trail
- `sprint-18.md` — ADR-0031 Пре-продакшн: лицензия Apache-2.0, бренд «Зяблик», ренейминг в zyablik-bot

## Status

```text
Sprint 0-3: Complete
Sprint 4: Partial (Task 4.1 personal dialog done; Task 4.2 chat reopened, see sprint-04.md)
Sprint 5: Complete (Task 5.1 docs research done; Task 5.2 async HTTP boundary done)
Sprint 6: Complete (Convention-based plugin loader)
Sprint 7: Complete (Identity Plugin Live Plan)
Sprint 8-12: Complete (ADR test coverage: safe logger, async HTTP, zero deps, DI, event contract)
Sprint 13: Complete (Bot Commands System — command parser, registry, pipeline dispatch, text-only responses)
Sprint 14: Complete (Queue Infrastructure — SQLite queue store, worker, pipeline integration)
Sprint 15: Complete (Ingress Pipeline — JWT auth, normalizers, HTTP server)
Sprint 16: Complete (App Wiring + Integration — end-to-end multi-source ingest)
Sprint 17: Planned (Lifecycle Audit Trail, ADR-0029)
Sprint 18: Complete (ADR-0031: лицензия Apache-2.0, бренд «Зяблик», ренейминг в zyablik-bot)
```

Детальная информация в `tasks/sprints/sprint-07.md`.
