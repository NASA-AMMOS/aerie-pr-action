import * as core from "@actions/core";
import * as github from "@actions/github";

async function run(): Promise<void> {
    try {
        core.info("Starting PR action...");

        // only run when triggered by PR
        const pull_request = github.context.payload.pull_request;
        if (pull_request === undefined) {
            throw new Error("Error, not triggered from PR, aborting...");
        }

        const token: string = core.getInput("token", { required: true });

        // create auth'd github api client
        const gh = github.getOctokit(token);

        // gather context about PR
        const context = github.context;

        const owner = context.repo.owner;
        const repo = context.repo.repo;
        const pull_number = pull_request.number;

        const pr = await gh.rest.pulls.get({
            owner,
            repo,
            pull_number
        });

        const user = pr.data.user;
        if (!user) {
            throw new Error("Error reading user info");
        }

        // assign user who opened PR as default assignee
        const assignees = [user.login];

        const resp = await gh.rest.issues.addAssignees({
            owner,
            repo,
            issue_number: pull_number,
            assignees
        });

        const status = resp.status;

        core.info(
            `resp: ${status}, assigned ${assignees} to PR ${pull_number} in ${repo}`
        );
    } catch (error) {
        if (error instanceof Error) core.setFailed(error.message);
    }
}

run();
