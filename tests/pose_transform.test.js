const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function vector(value) {
    value.V3_set = function(next) {
        this[0] = next[0];
        this[1] = next[1];
        this[2] = next[2];
        return this;
    };
    return value;
}

class Group {
    constructor(uuid, name, origin, rotation, parent = 'root') {
        this.uuid = uuid;
        this.name = name;
        this.origin = vector(origin);
        this.rotation = vector(rotation);
        this.parent = parent;
        this.children = [];
        this.preview_controller = {updateTransform() {}};
        this.mesh = {
            position: {x: 0, y: 0, z: 0},
            rotation: {x: 0, y: 0, z: 0}
        };
        if (parent instanceof Group) parent.children.push(this);
    }
}
Group.all = [];

class Cube {
    constructor(parent, from, to, origin) {
        this.parent = parent;
        this.from = vector(from);
        this.to = vector(to);
        this.origin = vector(origin);
        this.preview_controller = {updateAll() {}};
        parent.children.push(this);
    }
}

class BoneAnimator {}

const actions = {};
class Action {
    constructor(id, options) {
        this.id = id;
        Object.assign(this, options);
        actions[id] = this;
    }
    delete() {}
}

let lastDialog;
class Dialog {
    constructor(options) {
        this.options = options;
        lastDialog = this;
    }
    show() { return this; }
}

const root = new Group('root-bone', 'root', vector([0, 0, 0]), vector([0, 0, 0]));
const child = new Group('child-bone', 'child', vector([1, 0, 0]), vector([0, 0, 0]), root);
Group.all.push(root, child);
const cube = new Cube(child, vector([1, 0, 0]), vector([2, 1, 1]), vector([1.5, 0.5, 0.5]));

const project = {
    unhandled_root_fields: {},
    saved: true
};
const animation = {
    uuid: 'animation-id',
    name: 'animation.test.pose',
    type: 'animation',
    animators: {}
};

function resetMeshesToModelData() {
    for (const group of Group.all) {
        const parentOrigin = group.parent instanceof Group ? group.parent.origin : [0, 0, 0];
        group.mesh.position.x = group.origin[0] - parentOrigin[0];
        group.mesh.position.y = group.origin[1] - parentOrigin[1];
        group.mesh.position.z = group.origin[2] - parentOrigin[2];
        group.mesh.rotation.x = group.rotation[0] * Math.PI / 180;
        group.mesh.rotation.y = group.rotation[1] * Math.PI / 180;
        group.mesh.rotation.z = group.rotation[2] * Math.PI / 180;
    }
}

const context = {
    console,
    Date,
    Math: Object.assign(Object.create(Math), {
        radToDeg(value) { return value * 180 / Math.PI; }
    }),
    Project: project,
    Group,
    Cube,
    BoneAnimator,
    Outliner: {root: [root], elements: [cube]},
    Animation: {all: [animation], selected: animation},
    Timeline: {time: 0},
    Modes: {edit: true},
    Animator: {
        MolangParser: {resetVariables() {}},
        resetLastValues() {},
        showDefaultPose() { resetMeshesToModelData(); },
        stackAnimations() {
            root.mesh.position.x = 2;
            root.mesh.rotation.z = 30 * Math.PI / 180;
            child.mesh.position.x = 1;
            child.mesh.position.y = 3;
            child.mesh.rotation.y = 45 * Math.PI / 180;
        }
    },
    Canvas: {
        scene: {updateMatrixWorld() {}},
        updateAllBones() {},
        updateAllPositions() {}
    },
    Undo: {
        initEdit() {},
        finishEdit() {},
        cancelEdit() {}
    },
    Blockbench: {
        showQuickMessage() {},
        showMessageBox(options, callback) { if (callback) callback(0); }
    },
    BARS: {updateConditions() {}},
    MenuBar: {menus: {tools: {addAction() {}, removeAction() {}}}},
    Action,
    Dialog,
    updateSelection() {},
    Plugin: {
        register(id, options) {
            assert.equal(id, 'animation_pose_library');
            options.onload();
        }
    }
};

vm.createContext(context);
const pluginPath = path.resolve(__dirname, '..', 'animation_pose_library.js');
vm.runInContext(fs.readFileSync(pluginPath, 'utf8'), context, {filename: pluginPath});

actions.pose_library_define_default.click();
assert.deepEqual(
    Array.from(project.unhandled_root_fields.blockbench_animation_pose_lib.default_pose.bones['child-bone'].origin),
    [1, 0, 0]
);

actions.pose_library_apply_animation.click();
lastDialog.options.onConfirm({animation: animation.uuid, time: 0});

assert.deepEqual(Array.from(root.origin), [2, 0, 0]);
assert.deepEqual(Array.from(child.origin), [3, 3, 0]);
assert.deepEqual(Array.from(root.rotation), [0, 0, 30]);
assert.deepEqual(Array.from(child.rotation), [0, 45, 0]);
assert.deepEqual(Array.from(cube.from), [3, 3, 0]);
assert.deepEqual(Array.from(cube.to), [4, 4, 1]);
assert.deepEqual(Array.from(cube.origin), [3.5, 3.5, 0.5]);

// Simulate a one-unit local geometry edit while the animation pose is applied.
cube.from[0] += 1;
cube.to[0] += 1;
cube.origin[0] += 1;

actions.pose_library_restore_default.click();

assert.deepEqual(Array.from(root.origin), [0, 0, 0]);
assert.deepEqual(Array.from(child.origin), [1, 0, 0]);
assert.deepEqual(Array.from(root.rotation), [0, 0, 0]);
assert.deepEqual(Array.from(child.rotation), [0, 0, 0]);
assert.deepEqual(Array.from(cube.from), [2, 0, 0]);
assert.deepEqual(Array.from(cube.to), [3, 1, 1]);
assert.deepEqual(Array.from(cube.origin), [2.5, 0.5, 0.5]);

console.log('pose_transform.test.js passed');
