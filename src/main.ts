import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";

type Param = {
    owner: string;
    repo: string;
    pull_number: number;
};

const triggers = ["labeled", "unlabeled", "submitted", "edited", "dismissed"];

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

        // if this action was triggered by opening a PR
        // then assign the opener as the assignee
        if (!triggers.includes(context.eventName)) {
            core.info(
                `Action triggered by ${context.eventName}, attempting assignment...`
            );
            await assignment(param);
            return;
        }

        // otherwise, we were triggered by a event that mutates labels and or approvals,
        // so we need to recalculate
        core.info(
            `Triggered by ${context.eventName}, handling labels and approvals`
        );

        const labels = await detect_labels(param);

        const sufficient = await sufficient_approvals(param, labels);

        if (!sufficient) {
            throw new Error("Insufficient approvals, blocking merge...");
        } else {
            core.info("Sufficient approvals, allowing merge...");
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

async function sufficient_approvals(
    param: Param,
    labels: string[]
): Promise<boolean> {
    const num_reviews_resp = await gh.rest.pulls.listReviews(param);

    const num_reviews = num_reviews_resp.data.reduce(
        (acc, review) => (review.state === "APPROVED" ? acc + 1 : acc),
        0
    );

    const required_num_reviews = labels.includes("documentation") ? 1 : 2;
    core.info(`Determined ${required_num_reviews} approvals are needed`);

    const sufficient = num_reviews >= required_num_reviews;
    if (!sufficient) {
        core.error(
            `Need ${required_num_reviews} approvals, only have ${num_reviews}`
        );
    }

    return sufficient;
}

run();
