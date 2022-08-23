import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";

type Param = {
    owner: string;
    repo: string;
    pull_number: number;
};

let gh: InstanceType<typeof GitHub>;

async function run(): Promise<void> {
    try {
        core.info("Starting PR action...");

        // only run when triggered by PR
        const pull_request = github.context.payload.pull_request;
        if (pull_request?.number === undefined) {
            throw new Error(
                "Error, not triggered from PR, can't find PR ID, aborting..."
            );
        }

        const token: string = core.getInput("token", { required: true });

        // create auth'd github api client
        gh = github.getOctokit(token);

        // gather context about PR
        const context = github.context;

        const param: Param = {
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: pull_request.number
        };

        // get event type of action trigger and act accordingly
        const event_type = context.payload.action ?? "NO EVENT TYPE";

        core.info(`Triggered by ${context.eventName}: ${event_type}`);

        switch (event_type) {
            // only run assignment if we opened a PR
            case "opened": {
                await assignment(param);
                break;
            }
            // otherwise, handle labels and approvals
            default: {
                const labels = await detect_labels(param);
                await conditional_approve(param, labels);
                break;
            }
        }
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

async function assignment(param: Param): Promise<void> {
    const pr = await gh.rest.pulls.get({
        owner: param.owner,
        repo: param.repo,
        pull_number: param.pull_number
    });

    const user = pr.data.user;
    if (!user) {
        throw new Error("Error reading user info");
    }

    // assign user who opened PR as default assignee
    const assignees = [user.login];

    const assign_resp = await gh.rest.issues.addAssignees({
        owner: param.owner,
        repo: param.repo,
        issue_number: param.pull_number,
        assignees
    });

    core.info(
        `resp: ${assign_resp.status}, assigned ${assignees} to PR ${param.pull_number} in ${param.repo}`
    );
}

async function detect_labels(param: Param): Promise<string[]> {
    // detect labels
    const label_resp = await gh.rest.issues.listLabelsOnIssue({
        owner: param.owner,
        repo: param.repo,
        issue_number: param.pull_number
    });

    const labels = label_resp.data.map(label => label.name);

    core.info("Found the following labels:");
    for (const s of labels) {
        core.info(s);
    }

    return labels;
}

async function conditional_approve(
    param: Param,
    labels: string[]
): Promise<boolean> {
    const num_reviews_resp = await gh.rest.pulls.listReviews(param);

    // check if we already have enough approvals
    // since there is no need to add another then
    const num_approvals = num_reviews_resp.data.reduce(
        (acc, review) => (review.state === "APPROVED" ? acc + 1 : acc),
        0
    );

    if (num_approvals >= 2) {
        core.info("Sufficient approvals detected, not approving...");
        return false;
    }

    // get the list of applicable labels
    const labels_needing_approval = labels.filter(
        (l: string) => l === "documentation" || l === "hotfix"
    );

    // and conditionally approve
    if (labels_needing_approval.length > 0) {
        // check if the github-actions bot has already approved this PR
        // to avoid duplicate approvals
        const num_bot_approvals = num_reviews_resp.data.reduce(
            (acc, review) =>
                review.user?.login === "github-actions" ? acc + 1 : acc,
            0
        );
        if (num_bot_approvals > 0) {
            core.info(
                "Detected an existing approval by myself (github-actions bot), not approving again..."
            );
            return false;
        }

        core.info("Approving PR...");
        gh.rest.pulls.createReview({
            ...param,
            event: "APPROVE",
            body: `Automatically approved due to detection of the following labels: ${labels_needing_approval}`
        });
    }

    return labels_needing_approval.length > 0;
}

run();
