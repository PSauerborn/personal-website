# Hidden Draft: Kubernetes Operators

*Draft. Not published — the second half is still a list of grievances rather
than an argument.*

## The premise

An operator is a control loop with domain knowledge. That is the whole idea, and
it is a good one: the loop observes the cluster, compares what it sees against
what was declared, and takes one step toward closing the gap. Then it does it
again. Forever.

The reconcile function is where the discipline lives:

```go
func (r *DatabaseReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	var db v1alpha1.Database
	if err := r.Get(ctx, req.NamespacedName, &db); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if err := r.ensureBackingStore(ctx, &db); err != nil {
		return ctrl.Result{RequeueAfter: time.Minute}, err
	}

	return ctrl.Result{}, r.Status().Update(ctx, &db)
}
```

Three properties make or break it:

- **Idempotence.** Reconcile will be called again with the same input. If that
  creates a second backing store, the operator is not a control loop, it is a
  trigger with extra steps.
- **Level-triggered, not edge-triggered.** Do not react to the event; react to
  the observed state. Events are lost, replayed, and delivered out of order.
- **Status is a report, not a variable.** Anything the operator needs to
  remember belongs in the spec or in the world. Status that the operator reads
  back as input is state you will one day have to reconstruct by hand.

## The part that is still a grievance

Most things sold as operators should have been a Helm chart and a cron job. The
test is whether the resource has a genuine ongoing reconciliation obligation —
failover, resharding, credential rotation — or whether it is installed once and
then left alone. If it is the latter, a custom resource definition buys nothing
except a new way for the cluster to be broken at 3am by code only one person has
read.

*TODO: finish the section on finalizers and deletion ordering, and cut the
paragraph above down to something publishable.*
