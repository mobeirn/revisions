const BLOCKED_START = 'BLOCKED changed from [false] to [true]';
const BLOCKED_END = 'BLOCKED changed from [true] to [false]';

var startBlocked;
var endBlocked;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    _artifacts: [],
    items: [
        {
            // This container controls the layout of the pulldowns
            xtype: 'container',
            itemId: "pulldown-container",
            layout: {
                type: 'hbox',
                align: 'stretch'
            },
            style: {
                padding: '10px',
                border: '1px solid'
            }
        }
    ],

    launch: function () {
        console.log('Starting...');
        var me = this;
        console.log('Creating store...');
        var startTime = Date.now();
        var storyStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            fetch: true,
            autoLoad: true,
            limit: Infinity//Gets all pages. Default is 1
        });
        me._logTimeTaken(startTime);

        me._addReleaseCombo();
        me._addProjectPicker();

        storyStore.load().then({
            // me._loadStore(storyStore).then({
            success: this._getRevHistoryModel,
            scope: this
        }).then({
            success: this._onRevHistoryModelCreated,
            scope: this
        }).then({
            success: this._onModelLoaded,
            scope: this
        }).then({
            success: this._stitchDataTogether,
            scope: this
        }).then({
            success: this._getBlockedItems,
            scope: this
        }).then({
            success: function (results) {
                // me._addReleaseCombo();
                // me._addProjectPicker();
                me._makeGrid(results);
            },
            failure: function () {
                console.log("oh noes!");
            }
        });
    },

    _loadStore: function (store) {
        var me = this;
        console.log('Loading store...');
        var startTime = Date.now();
        var loadedStore = store.load();
        me._logTimeTaken(startTime);
        return loadedStore;

    },

    _getRevHistoryModel: function (storyStore) {
        this._storyStore = storyStore;
        // _.each(this._storyStore, function (artifact) {
        //     if(artifact.data.Release) {
        //     var relName = artifact.data.Release._refObjectName;
        //     console.log('Release: ', relName);
        //     }
            
        // });

        return Rally.data.ModelFactory.getModel({
            type: 'RevisionHistory'
        });
    },

    _onRevHistoryModelCreated: function (model) {
        console.log('Revision history model created.');
        var me = this;
        var startTime = Date.now();
        var promises = [];
        _.each(this._storyStore, function (artifact) {
            var ref = artifact.get('RevisionHistory')._ref;
            //   console.log(artifact.get('FormattedID'), ref);
            promises.push(model.load(Rally.util.Ref.getOidFromRef(ref)));
        });
        me._logTimeTaken(startTime);
        return Deft.Promise.all(promises);
    },

    _onModelLoaded: function (histories) {
        console.log('Getting Revision histories...');
        var me = this;
        var promises = [];
        var startTime = Date.now();
        _.each(histories, function (history) {
            var revisions = history.get('Revisions');
            revisions.store = history.getCollection('Revisions', { fetch: ['User', 'Description', 'CreationDate', 'RevisionNumber'] });
            promises.push(revisions.store.load());
        });
        me._logTimeTaken(startTime);
        return Deft.Promise.all(promises);
    },

   /**
    * Combines stories with their revisions
    * @param {*} revhistories Revision history to get revisions from
    */ 
    _stitchDataTogether: function (revhistories) {
        console.log('Putting data together...');
        var me = this;
        var startTime = Date.now();
        var promises = [];
        _.each(me._storyStore, function (artifact) {
            promises.push({ artifact: artifact.data });
        });

        var i = 0;
        //Add revisions arrays to storyStore
        _.each(revhistories, function (revisions) {
            promises[i].revisions = revisions;
            i++;
        });
        me._logTimeTaken(startTime);
        return Deft.Promise.all(promises);
    },

    _getBlockedItems: function (storyStoreWithRevs) {
        console.log('Getting blocked items...');
        var startTime = Date.now();
        var me = this;
        var i = 0;
        var blockedArtifacts = [];
        _.each(storyStoreWithRevs, function (artifactWithRev) {
            var blockedTime = 0;
            var artifactFormattedId = artifactWithRev.artifact.FormattedID;
            var artifactRevisions = artifactWithRev.revisions;
            if (artifactRevisions != undefined) {
                _.each(artifactRevisions, function (revision) {
                    var revisionDescription = revision.data.Description;

                    if (revisionDescription.includes(BLOCKED_START)) {
                        blockedTime = me._getTotalHoursBlocked(artifactWithRev);

                    }

                });
                if (blockedTime > 0) {
                    console.log('Blocked artifact: ', artifactFormattedId);
                    console.log('Blocked for: ', blockedTime);
                    artifactWithRev.blockedHours = blockedTime;
                    blockedArtifacts.push(artifactWithRev);
            }
        }

        });
        me._logTimeTaken(startTime);
        return blockedArtifacts;
    },

    /**
     * Adds the Project picker
     */
    _addProjectPicker: function () {
        console.log('Adding Project Picker');
        var me = this;
        var projectPicker = (
            {
                xtype: 'rallyprojectpicker',
                itemId: 'project-picker',
                fieldLabel: 'Project',
                labelAlign: 'right',
                // listeners: {
                //     ready: me._addReleaseCombo(),
                //     scope: me
                // }

                //Set initial project if required
                // value: '/project/140511004472'//Edge of Tomorrow
            }
        );
        me.down('#pulldown-container').add(projectPicker);
    },

    /**
     * Adds the release Combo dropdown
     * Loads data once selected
     */
    _addReleaseCombo: function () {
        //TODO: #2 get listeners to work
        console.log('Adding Release combo box');
        var me = this;

        var context = me.getContext;
        var releaseComboBox = (
            {
                xtype: 'rallyreleasecombobox',
                itemId: 'release-combobox',
                fieldLabel: 'Release',
                labelAlign: 'right',
                listeners: {
                    // select: me._loadData,
                    select: me._makeGrid,
                    scope: me
                },

                //Set initial value if required
                // value: '/release/278229164760'//PI 23
            }
        );
        me.down('#pulldown-container').add(releaseComboBox);
    },

    _getFilters: function (releaseValue) {
        var releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
            property: 'Release',
            value: releaseValue
        });
        return releaseFilter;
    },

    _getHoursBlocked: function (start, end) {
        const milliseconds = Math.abs(new Date(end) - new Date(start));
        const hours = milliseconds / 36e5;
        return hours;
    },

    /**
     * Get all the hours blocked for all revisions of that artifact
     * @param {*} revisions The Revision history of the artifact
     */
    _getTotalHoursBlocked: function (revisions) {       
        console.log('Getting total hours blocked...');
        var me = this;
        var revs = revisions.revisions;
        var totalHoursBlocked = 0;
        var endBlocked = 0;
        var startBlocked = 0;
        revs.forEach(rev => {
            var revHoursBlocked = parseInt(me._getRevHoursBlocked(rev));
            totalHoursBlocked += revHoursBlocked;
        });
        return totalHoursBlocked;
    },

    /**
     * Get hours blocked for a particular revision
     * @param {*} rev the revision
     */
    _getRevHoursBlocked: function (rev) {
        var me = this;
        var revHoursBlocked = 0;
        if (rev.data.Description.includes(BLOCKED_START)) {
            startBlocked = rev.data.CreationDate;
            revHoursBlocked += me._getHoursBlocked(startBlocked, endBlocked);
        }
        else if (rev.data.Description.includes(BLOCKED_END)) {
            endBlocked = rev.data.CreationDate;
        }
        return revHoursBlocked.toFixed(0);
    },

    _getDaysFromHours: function (hours) {
        return Math.round(hours / 24 * 100) / 100;
    },

    /**
     * Creates a store using the blocked artifacts and time blocked data
     * @param {*} storyStoreWithRevs blocked artifacts and time blocked data
     * @return {*} Filtered store
     */
    _loadData: function (storyStoreWithRevs) {
        console.log('Loading data...');
        var me = this;
        var startTime = Date.now();
        var releaseCombo = me.down('#release-combobox');
        var selectedReleaseRef = releaseCombo.getValue();
        var storeFilters = me._getFilters(selectedReleaseRef); 

        var store =  Ext.create('Rally.data.custom.Store', {
            data: storyStoreWithRevs,
            filters: [
                storeFilters
            ],
        });
        store.load();
        me._logTimeTaken(startTime);

        return store;
    },

    /**
     * Makes a grid using the blocked artifact store
     * @param {*} storyStoreWithRevs 
     */
    _makeGrid: function (storyStoreWithRevs) {
        
        var me = this;       
        me.dataStore = me._loadData(storyStoreWithRevs);
        
        var startTime = Date.now();

        if (me.grid) {
            console.log('Grid exists');
            me.grid.store = me.dataStore;
        } else {
            console.log('Making grid...');
        me.grid = me.add({
            xtype: 'rallygrid',
            showPagingToolbar: true,
            showRowActionsColumn: false,
            style: {
                width: ' 100%'
            },
            store: me.dataStore,
            columnCfgs: [
                {
                    text: 'ID', dataIndex: 'artifact', width: 100,
                    renderer: function (value) {
                        return '<a href="https://rally1.rallydev.com/#/detail/userstory/' + value.ObjectID + '" target="_blank">' + value.FormattedID + '</a>';
                    }
                },
                {
                    text: 'Name', dataIndex: 'artifact', flex: 1,
                    renderer: function (artifact) {
                        return artifact.Name;
                    }
                },
                {
                    text: 'Release', dataIndex: 'artifact', minWidth: 200,
                    renderer: function (artifact) {
                        if (artifact.Release) {
                            return artifact.Release._refObjectName;
                        } else {
                            return '';
                        }
                    }
                },
                {
                    text: 'Team', dataIndex: 'artifact', minWidth: 200,
                    renderer: function (artifact) {
                        return artifact.Project._refObjectName;
                    }
                },
                // {
                //     text: 'Tags', dataIndex: 'artifact',
                //     renderer: function (artifact) {
                //         return artifact.Tags;
                //     }
                // },
                {
                    text: 'Time blocked', dataIndex: 'blockedHours', minWidth: 200,
                    renderer: function (blockedHours) {
                        var blockedDays = me._getDaysFromHours(blockedHours);
                        return blockedHours + ' hours (' + blockedDays + ' days)';
                    }
                },
            ]
        });
        }
       
        console.log('Grid store: ', me.grid.store);
        me._logTimeTaken(startTime);

    },
    _logTimeTaken: function (startTime) {
        var endTime = Date.now();
        console.log('Time taken ' + (endTime - startTime) + 'ms');
    }
});