const BLOCKED_START = 'BLOCKED changed from [false] to [true]';
const BLOCKED_END = 'BLOCKED changed from [true] to [false]';

var startBlocked;
var endBlocked;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    _artifacts:[],

    launch: function() {
        var me = this;
        // var selectedReleaseRef = me.down('#release-combobox').getRecord().get('_ref');
        // var storeFilters = me._getFilters(selectedReleaseRef);

        var artifacts = Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            fetch: ['ObjectID', 'FormattedID','Name','RevisionHistory','Revisions','Description','Project'],
            autoLoad: true,
        });
        artifacts.load().then({
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
            success:function(results) {
                me._addReleaseCombo();
                me._makeGrid(results);
            },
            failure: function(){
                console.log("oh noes!");
            }
        });
    },
    _getRevHistoryModel:function(artifacts){
        this._artifacts = artifacts;
        return Rally.data.ModelFactory.getModel({
            type: 'RevisionHistory'
        });
    },
  _onRevHistoryModelCreated: function(model) {
    // console.log('Revision history model: ', model);
    var promises = [];
    _.each(this._artifacts, function(artifact){
      var ref = artifact.get('RevisionHistory')._ref;
    //   console.log(artifact.get('FormattedID'), ref);
        promises.push(model.load(Rally.util.Ref.getOidFromRef(ref)));
    }); 
    return Deft.Promise.all(promises);  
   },
    _onModelLoaded: function (histories) {
        // console.log('Revision histories: ', histories);
        var promises = [];
        _.each(histories, function (history) {
            var revisions = history.get('Revisions');
            revisions.store = history.getCollection('Revisions', { fetch: ['User', 'Description', 'CreationDate', 'RevisionNumber'] });
            promises.push(revisions.store.load());
        });
        return Deft.Promise.all(promises);
    },
    _stitchDataTogether: function (revhistories) {
        var me = this;
        var promises = [];
        _.each(me._artifacts, function (artifact) {
            promises.push({ artifact: artifact.data });
        });

        var i = 0;
        //Add revisions arrays to artifacts
        _.each(revhistories, function (revisions) {      
            promises[i].revisions = revisions;
            i++;
        });
        return Deft.Promise.all(promises);
    },
    _getBlockedItems: function (artifactsWithRevs) {
        var me = this;
        var i = 0;
        var blockedArtifacts = [];
        _.each(artifactsWithRevs, function (artifactWithRev) {
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
                // blockedArtifacts.push(artifactWithRev);
            }

        });
        return blockedArtifacts;
    },
    _addReleaseCombo: function () {
        console.log('Adding Release combo box');
        var me = this;
        me.add(
            {
                xtype: 'rallyreleasecombobox',
                itemId: 'release-combobox',
                fieldLabel: 'Release',
                labelAlign: 'right',
                // listeners: {
                //     ready: me._makeGrid(),
                //     scope: me
                // }
            }
        );
        
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
    _getTotalHoursBlocked: function (revisions) {
        // Get all the hours blocked for all revisions of that artifact
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

    _getRevHoursBlocked: function (rev) {
        //Get hours blocked for a particular revision
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
        return Math.round(hours/24 * 100) / 100;
    }, 
     
    _makeGrid: function (artifactsWithRevs) {
        //   console.log('Artifacts with Revs: ', artifactsWithRevs);
        
        var me = this;
        this.add({
            xtype: 'rallygrid',
            showPagingToolbar: true,
            showRowActionsColumn: false,
            editable: false,
            store: Ext.create('Rally.data.custom.Store', {
                data: artifactsWithRevs,
            }),
            columnCfgs: [
                {
                    text: 'ID', dataIndex: 'artifact', width: 100,
                    renderer: function (value) {
                        return '<a href="https://rally1.rallydev.com/#/detail/userstory/' + value.ObjectID + '" target="_blank">' + value.FormattedID + '</a>';
                    }
                },
                {
                    text: 'Name', dataIndex: 'artifact', minWidth: 500,
                    renderer: function (artifact) {
                        return artifact.Name;
                    }
                },
                {
                    text: 'Team', dataIndex: 'artifact', minWidth: 200,
                    renderer: function (artifact) {
                        return artifact.Project.Name;
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
    
});

