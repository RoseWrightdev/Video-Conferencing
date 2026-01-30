use criterion::{black_box, criterion_group, criterion_main, Criterion};
use dashmap::DashMap;
use sfu::id_types::UserId; // Need to expose sfu crate or id_types.

fn bench_clone_string(c: &mut Criterion) {
    let s = "some-long-user-id-string-1234567890".to_string();
    c.bench_function("clone_string", |b| {
        b.iter(|| {
            let _ = black_box(s.clone());
        })
    });
}

fn bench_clone_strong_id(c: &mut Criterion) {
    let id = UserId::from("some-long-user-id-string-1234567890");
    c.bench_function("clone_strong_id", |b| {
        b.iter(|| {
            let _ = black_box(id.clone());
        })
    });
}

fn bench_dashmap_insert_string(c: &mut Criterion) {
    let map = DashMap::new();
    let key = "some-long-user-id-string-1234567890".to_string();

    // We want to measure INSERT, including cloning key.
    // Ideally we clone key inside bench?
    // DashMap insert takes ownership of key.

    c.bench_function("dashmap_insert_string", |b| {
        b.iter(|| {
            // We have to clone key to insert it repeatedly
            map.insert(key.clone(), 1);
        })
    });
}

fn bench_dashmap_insert_strong_id(c: &mut Criterion) {
    let map = DashMap::new();
    let key = UserId::from("some-long-user-id-string-1234567890");

    c.bench_function("dashmap_insert_strong_id", |b| {
        b.iter(|| {
            map.insert(key.clone(), 1);
        })
    });
}

criterion_group!(
    benches,
    bench_clone_string,
    bench_clone_strong_id,
    bench_dashmap_insert_string,
    bench_dashmap_insert_strong_id
);
criterion_main!(benches);
